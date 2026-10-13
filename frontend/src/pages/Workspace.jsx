import React, { useState, useEffect, useRef } from 'react';
import VerticalSidebar from '../components/workspace/VerticalSidebar';
import WorkspaceHeader from '../components/workspace/WorkspaceHeader';
import ShopSidebar from '../components/workspace/ShopSidebar';
import ChatInterface from '../components/workspace/ChatInterface';
import PreviewDrawer from '../components/workspace/PreviewDrawer';
import { getWelcomeMessage } from '../services/chatService';
import '../styles/workspace.css';

const Workspace = () => {
  const [selectedShop, setSelectedShop] = useState(null);
  const [messages, setMessages] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Latest REAL backend job (source of truth for status/preview/copies).
  const [activeJob, setActiveJob] = useState(null);
  // MOBILE-ONLY navigation state: which single pane is shown on a phone.
  //   'list' -> the shop-selection list   |   'chat' -> the full-screen chat
  // Desktop/tablet ignore this (CSS only acts on it <=768px), so the existing
  // sidebar+chat layout is unchanged on large screens.
  const [mobileView, setMobileView] = useState('list');

  useEffect(() => {
    // Show welcome message on load
    const welcomeMsg = getWelcomeMessage();
    setMessages([welcomeMsg]);
  }, []);

  const handleSelectShop = (shop) => {
    const switchingShop = selectedShop?.id !== shop.id;
    setSelectedShop(shop);
    // On mobile, selecting a shop reveals the full-screen chat.
    setMobileView('chat');

    // Add the shop-specific welcome message ONLY the first time this shop is
    // chosen. Re-selecting the SAME shop (e.g. after tapping Back) must NOT
    // append another welcome or disturb the existing conversation/job — the
    // chat state is preserved as-is.
    if (!switchingShop) return;
    const shopWelcome = {
      id: `shop-welcome-${shop.id}`,
      type: 'ai',
      text: `Hi! I'm the AI assistant for ${shop.name}. I'm here to help you with your printing needs. You can upload documents and I'll help prepare them for printing. What would you like to print today?`,
      timestamp: new Date().toISOString()
    };
    // Guard against a duplicate welcome if one for this shop already exists.
    setMessages((prev) =>
      prev.some((m) => m.id === shopWelcome.id) ? prev : [...prev, shopWelcome],
    );
  };

  // Mobile "back" from the full-screen chat to the shop list. Preserves ALL
  // state (selected shop, conversation, active job, uploads) — it only changes
  // which pane is visible on a phone. No job is created/reset and nothing is
  // re-uploaded.
  const handleBackToShops = () => setMobileView('list');

  const handleFileUpload = (file) => {
    setUploadedFiles(prev => [...prev, file]);
    // Do NOT auto-open the preview drawer on upload. Opening it reserves a
    // fixed-width column (420px) of mostly-empty space before any edited
    // document is ready — the "large empty area on the right". The chat already
    // shows the edited document inline (EditedDocumentPreview) when it's ready.
    // The drawer remains available on demand via the drawer toggle, so the user
    // can still review the document in the established preview layout.
  };

  // Revoke local object URLs created for uploaded-file previews so blob: URLs
  // don't leak. We revoke only on unmount, reading the latest file list from a
  // ref — this guarantees we never revoke a URL that is still being rendered.
  const uploadedFilesRef = useRef([]);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);
  useEffect(() => {
    return () => {
      uploadedFilesRef.current.forEach((f) => {
        if (f && typeof f.previewUrl === 'string' && f.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, []);

  const handleJobUpdate = (job) => {
    setActiveJob(job);
  };

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <div className="workspace-page">
      <WorkspaceHeader />
      
      <div className={`workspace-container mobile-view-${mobileView}`}>
        <VerticalSidebar />
        
        <ShopSidebar 
          selectedShop={selectedShop} 
          onSelectShop={handleSelectShop} 
        />
        
        <div className="workspace-main">
          <ChatInterface
            selectedShop={selectedShop}
            messages={messages}
            setMessages={setMessages}
            onFileUpload={handleFileUpload}
            onJobUpdate={handleJobUpdate}
            onBackToShops={handleBackToShops}
          />
          
          <PreviewDrawer
            isOpen={drawerOpen}
            onClose={toggleDrawer}
            uploadedFiles={uploadedFiles}
            activeJob={activeJob}
          />
        </div>
      </div>
    </div>
  );
};

export default Workspace;
