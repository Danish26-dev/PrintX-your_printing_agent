import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Loader2, ArrowLeft } from 'lucide-react';
import {
  messageFromJob,
  sendInstruction,
  approveJob,
  sendToPrintShop,
  getUploadedMessage,
  classifyMessage,
  contextualPrompt,
  isConfirmationMessage,
  ChatIntent,
} from '../../services/chatService';
import { uploadFile, getJob, ApiError } from '../../services/fileService';
import { getSelectedDevice } from '../../services/selectedDeviceService';
import { wasSharedInto, consumeSharedFile, clearSharedFlag } from '../../services/shareTarget';
import DocumentPreviewCard from './DocumentPreviewCard';
import EditedDocumentPreview from './EditedDocumentPreview';
import '../../styles/workspace.css';

const ChatInterface = ({ selectedShop, messages, setMessages, onFileUpload, onJobUpdate, onBackToShops }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState(null);
  // The REAL backend job id is the single source of truth for the conversation.
  const [activeJobId, setActiveJobId] = useState(null);
  // The latest backend job VIEW (carries .status) — the conversation state
  // machine routes follow-up messages according to this, so "proceed" after an
  // edit means "send to the shop", not "start a new edit".
  const [activeJob, setActiveJob] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamingIntervalRef = useRef(null);
  // Ensures a shared-in file is ingested exactly once per navigation.
  const sharedConsumedRef = useRef(false);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, streamingMessage]);

  // Web Share Target: if the app was opened by sharing a document into it
  // (?shared=1), pull the file the service worker stashed and run it through
  // the SAME upload path as the file picker. Requires a selected shop (the
  // upload is shop-scoped); runs once. No-op when nothing was shared or the
  // browser doesn't support share targets.
  useEffect(() => {
    if (!selectedShop || sharedConsumedRef.current || !wasSharedInto()) return;
    sharedConsumedRef.current = true;
    clearSharedFlag();
    (async () => {
      const file = await consumeSharedFile();
      if (file) await ingestFile(file);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShop]);

  useEffect(() => {
    return () => {
      if (streamingIntervalRef.current) clearInterval(streamingIntervalRef.current);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Preserve the existing word-by-word streaming UX for AI messages.
  const streamText = (fullText, messageData) => {
    if (streamingIntervalRef.current) clearInterval(streamingIntervalRef.current);

    let currentIndex = 0;
    const words = (fullText || '').split(' ');

    setStreamingMessage({ ...messageData, text: '', isStreaming: true });

    streamingIntervalRef.current = setInterval(() => {
      if (currentIndex < words.length) {
        const currentText = words.slice(0, currentIndex + 1).join(' ');
        setStreamingMessage({
          ...messageData,
          text: currentText + (currentIndex < words.length - 1 ? ' ' : ''),
          isStreaming: true,
        });
        currentIndex++;
      } else {
        clearInterval(streamingIntervalRef.current);
        setStreamingMessage(null);
        setMessages((prev) => [...prev, { ...messageData, text: fullText }]);
      }
    }, 50);
  };

  const pushErrorMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `err-${Date.now()}`,
        type: 'ai',
        text,
        isError: true,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  // Send a natural-language instruction to the REAL backend for the active job.
  const submitInstruction = async (instruction) => {
    if (!activeJobId) {
      pushErrorMessage('Please upload a document first, then tell me what to change.');
      return;
    }
    setIsTyping(true);
    try {
      const job = await sendInstruction(activeJobId, instruction);
      setActiveJob(job);
      onJobUpdate && onJobUpdate(job);
      setIsTyping(false);
      const aiMsg = messageFromJob(job);
      streamText(aiMsg.text, aiMsg);
    } catch (error) {
      // TIMEOUT RECOVERY: if the request timed out or the connection dropped,
      // the BACKEND may still be processing the SAME job (one agent call can be
      // slow, e.g. a long PDF or a Vertex retry). We must NOT resend the
      // instruction (that would be a duplicate, non-idempotent request). Instead
      // query the existing job by id and reflect its real state once it settles.
      const code = error instanceof ApiError ? error.code : null;
      if (code === 'AGENT_TIMEOUT' || code === 'NETWORK') {
        const recovered = await recoverJobAfterTimeout(activeJobId);
        setIsTyping(false);
        if (recovered) {
          setActiveJob(recovered);
          onJobUpdate && onJobUpdate(recovered);
          const aiMsg = messageFromJob(recovered);
          streamText(aiMsg.text, aiMsg);
          return;
        }
        pushErrorMessage(
          'That took longer than expected and the connection dropped. Your document is safe — ' +
            'please check back in a moment; I did not resend the request to avoid duplicating it.',
        );
        return;
      }
      setIsTyping(false);
      pushErrorMessage(
        error instanceof ApiError
          ? error.message
          : "PrintX couldn't process that instruction. Please try again.",
      );
    }
  };

  // Poll the existing job (by id) a few times after a client timeout, WITHOUT
  // resending the instruction. Returns the job once it leaves PROCESSING, or
  // null if it is still processing / unreachable after the window.
  const recoverJobAfterTimeout = async (jobId) => {
    if (!jobId) return null;
    for (let i = 0; i < 10; i++) {
      try {
        const job = await getJob(jobId);
        if (job && job.status !== 'PROCESSING') return job;
      } catch {
        /* keep trying within the window */
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return null;
  };

  // Route a typed message according to the conversation state machine. Follow-up
  // messages are interpreted against the job's CURRENT backend status so a
  // confirmation like "proceed" after an edit sends the job to the shop instead
  // of restarting document inspection.
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedShop) return;

    const text = inputMessage;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), type: 'user', text, timestamp: new Date().toISOString() },
    ]);
    setInputMessage('');

    // Resolve the CURRENT job from conversation state before classifying. When
    // the message is a print confirmation ("OK PRINT", "go ahead", "send it to
    // the shop"…) and we hold an active job id, refresh the live job view so a
    // momentarily-stale `activeJob` (e.g. the state hasn't caught up to the
    // READY_FOR_PREVIEW edit response yet) can never misroute the confirmation
    // to "please upload the document again". This resolves the EXISTING edited
    // job by its id — it never creates a new job.
    let jobForIntent = activeJob;
    if (activeJobId && isConfirmationMessage(text)) {
      try {
        const fresh = await getJob(activeJobId);
        if (fresh) {
          jobForIntent = fresh;
          setActiveJob(fresh);
        }
      } catch {
        /* keep the last known job view; classification falls back to it */
      }
    }

    const { intent } = classifyMessage(text, jobForIntent);

    switch (intent) {
      case ChatIntent.CONFIRM_PRINT: {
        // Confirmation on an edited, previewed document -> approve + send to the
        // shop. We reuse the real print flow against the SAME job id; we never
        // auto-submit a physical print and never create a new job.
        const doc = messageFromJob(jobForIntent).editedDoc;
        await handlePrintClick(doc, { skipUserBubble: true });
        return;
      }
      case ChatIntent.DECLINE:
      case ChatIntent.ALREADY_IN_SHOP:
      case ChatIntent.NEEDS_UPLOAD:
      case ChatIntent.CLARIFY_CONFIRM: {
        // Nothing to send to the agent — answer contextually in the chat without
        // re-running document inspection. This is the guard that prevents the
        // "proceed?" / "yes" loop: a bare confirmation or decline is NEVER
        // re-sent to the agent with the same input, so the same question can
        // never be produced again. DECLINE also preserves the job untouched.
        const prompt = contextualPrompt(intent, activeJob);
        streamText(prompt, {
          id: `ctx-${Date.now()}`,
          type: 'ai',
          timestamp: new Date().toISOString(),
          jobStatus: activeJob?.status,
          jobId: activeJobId,
        });
        return;
      }
      case ChatIntent.CHANGE_SETTINGS:
      case ChatIntent.EDIT:
      default:
        // A settings change or further edit is sent to the agent, which
        // re-proposes the updated configuration on the SAME job (set_print_options
        // merges with what it already captured — other settings are preserved).
        await submitInstruction(text);
    }
  };

  // Approve the edited document, then send it to PrintX Lab for printer
  // configuration. The customer does NOT submit the print — the shopkeeper
  // gives the final approval in their workspace. We never claim it printed.
  const handlePrintClick = async (doc, opts = {}) => {
    const jobId = doc?.jobId || activeJobId;
    if (!jobId) return;

    if (!opts.skipUserBubble) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: 'user',
          text: '🖨️ Send to print shop',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
    setIsTyping(true);

    try {
      // READY_FOR_PREVIEW -> APPROVED. If a previous attempt already approved
      // (job now APPROVED/PRINT_FAILED), approve() returns INVALID_STATE — that
      // is fine, we proceed straight to (re)configuration on the same job. Only
      // a genuinely unexpected error aborts.
      try {
        await approveJob(jobId);
      } catch (approveErr) {
        if (!(approveErr instanceof ApiError) || approveErr.code !== 'INVALID_STATE') throw approveErr;
      }
      // Forward the agent's parsed print options (colour/paper/orientation/
      // sides/copies) so the real printer is configured per the customer's
      // request — not hardcoded defaults.
      const proposed = doc?.proposedPrintSettings || undefined;
      // Honour the shopkeeper's explicitly selected device mode (real | demo).
      const selectedDevice = getSelectedDevice();
      const mode = selectedDevice?.mode;
      const job = await sendToPrintShop(jobId, proposed, mode); // APPROVED -> READY_FOR_APPROVAL
      setActiveJob(job);
      onJobUpdate && onJobUpdate(job);
      setIsTyping(false);

      // Honest message: the job is now with the shop awaiting their approval to
      // print. No claim of submission or physical printing.
      let honest;
      if (job.status === 'READY_FOR_APPROVAL') {
        const s = job.printSettings;
        const sidesText = s
          ? s.sides === 'one-sided'
            ? 'single-sided'
            : 'double-sided'
          : '';
        honest =
          `Your document has been sent to PrintX Lab and the print settings were verified` +
          (s
            ? ` (${s.copies} ${s.copies === 1 ? 'copy' : 'copies'}, ${s.paperSize}, ${s.colorMode}, ${s.orientation}, ${sidesText}).`
            : '.') +
          (job.configWarnings && job.configWarnings.length
            ? `\n\nNote: ${job.configWarnings.join(' ')}`
            : '') +
          `\n\nThe shop will give the final approval before anything prints.`;
      } else if (job.status === 'PRINT_FAILED') {
        honest = (job.error && job.error.message) || 'The printer could not be configured. Please try again.';
      } else {
        honest = `Document status: ${job.status}.`;
      }
      streamText(honest, {
        id: `print-${Date.now()}`,
        type: 'ai',
        timestamp: new Date().toISOString(),
        jobStatus: job.status,
      });
    } catch (error) {
      setIsTyping(false);
      pushErrorMessage(
        error instanceof ApiError ? error.message : 'We could not send this to the print shop. Please try again.',
      );
    }
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    // Only one active document/job at a time in this flow.
    await ingestFile(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // The SINGLE real upload path, shared by the file picker AND the Web Share
  // Target receiver. It uses the existing uploadFile() API — one real job, no
  // duplication, no simulation.
  const ingestFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, selectedShop?.id); // REAL upload -> real job (shop-scoped)
      setActiveJobId(uploaded.jobId);
      // Seed the conversation state machine with the freshly uploaded job so
      // the first follow-up message is routed against a real status.
      setActiveJob({ id: uploaded.jobId, status: uploaded.status || 'UPLOADED' });
      onFileUpload && onFileUpload(uploaded);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          type: 'user',
          text: '',
          file: uploaded,
          timestamp: new Date().toISOString(),
        },
      ]);

      // Real "document received" prompt (not a fake analysis animation).
      setIsTyping(true);
      const uploadedMsg = getUploadedMessage({ id: uploaded.jobId, status: uploaded.status });
      setIsTyping(false);
      streamText(uploadedMsg.text, uploadedMsg);
    } catch (error) {
      pushErrorMessage(
        error instanceof ApiError ? error.message : 'Upload failed. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!selectedShop) {
    return (
      <div className="chat-empty-state">
        <div className="empty-state-content">
          <div className="empty-icon">💬</div>
          <h3>Select a Print Shop</h3>
          <p>Choose a shop from the left sidebar to start chatting with their AI assistant</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-header">
        {/* Mobile-only back arrow: returns to the shop list without disturbing
            the conversation/job (CSS hides it on desktop). */}
        <button
          type="button"
          className="chat-back"
          onClick={() => onBackToShops && onBackToShops()}
          aria-label="Back to print shops"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="chat-shop-info">
          <h3>{selectedShop.name}</h3>
          <p className="chat-shop-status">
            <span className="status-dot online"></span>
            AI Assistant Active
          </p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.type}`}>
            <div className={`message-bubble ${message.file || message.editedDoc ? 'has-file' : ''}`}>
              {message.file ? (
                <DocumentPreviewCard file={message.file} />
              ) : message.editedDoc ? (
                <>
                  <p className="message-text">{message.text}</p>
                  <EditedDocumentPreview
                    doc={message.editedDoc}
                    onPrintClick={() => handlePrintClick(message.editedDoc)}
                  />
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              ) : (
                <>
                  <p className="message-text">{message.text}</p>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        {streamingMessage && (
          <div className="message message-ai">
            <div className="message-bubble">
              {streamingMessage.editedDoc ? (
                <>
                  <p className="message-text streaming-text">{streamingMessage.text}</p>
                  <EditedDocumentPreview
                    doc={streamingMessage.editedDoc}
                    onPrintClick={() => handlePrintClick(streamingMessage.editedDoc)}
                  />
                </>
              ) : (
                <p className="message-text streaming-text">
                  {streamingMessage.text}
                  <span className="streaming-cursor">▋</span>
                </p>
              )}
            </div>
          </div>
        )}

        {isTyping && !streamingMessage && (
          <div className="message message-ai">
            <div className="message-bubble typing-bubble">
              <div className="typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept=".pdf,.docx"
          multiple={false}
        />

        <button
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 size={20} className="spinner" /> : <Paperclip size={20} />}
        </button>

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message or upload a document..."
          className="chat-input"
        />

        <button className="send-button" onClick={handleSendMessage} disabled={!inputMessage.trim()}>
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
