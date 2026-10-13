import React, { useState } from 'react';
import { ChevronLeft, FileText, Edit3, Printer, X, Download } from 'lucide-react';
import { formatFileSize } from '../../services/fileService';
import '../../styles/workspace.css';

const PreviewDrawer = ({ isOpen, onClose, uploadedFiles, activeJob }) => {
  const [activeTab, setActiveTab] = useState('uploaded');

  const tabs = [
    { id: 'uploaded', label: 'Uploaded', icon: <FileText size={16} /> },
    { id: 'edited', label: 'Edited', icon: <Edit3 size={16} /> },
    { id: 'final', label: 'Print Ready', icon: <Printer size={16} /> }
  ];

  // The real processed document is available only when the Backend reports
  // READY_FOR_PREVIEW. We build absolute URLs from the API base.
  const apiBase = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const editedReady = activeJob && activeJob.status === 'READY_FOR_PREVIEW' && activeJob.hasOutput;
  const editedPreviewUrl = editedReady ? `${apiBase}/api/jobs/${activeJob.id}/preview` : null;
  const editedIsPdf = editedReady && (activeJob.outputFormat || '').toLowerCase() === 'pdf';

  // Render the REAL processed output (from the Backend) for edited/print tabs.
  const renderEdited = (statusLabel) => {
    if (!editedReady) {
      return (
        <div className="preview-empty">
          <Edit3 size={48} />
          <p>The edited document will appear here once PrintX has prepared it.</p>
        </div>
      );
    }
    return (
      <div className="preview-content-wrapper">
        {editedIsPdf ? (
          <div className="preview-pdf-container">
            <iframe
              src={`${editedPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              title="Edited document"
              className="preview-pdf-iframe"
              frameBorder="0"
            />
          </div>
        ) : (
          <div className="preview-document-fallback">
            <FileText size={64} className="preview-doc-icon-large" />
            <p className="preview-doc-name-large">{`printx_${activeJob.id}.${activeJob.outputFormat}`}</p>
            <p className="preview-doc-type">{(activeJob.outputFormat || '').toUpperCase()} • {activeJob.copies} {activeJob.copies === 1 ? 'copy' : 'copies'}</p>
            <a
              className="doc-action-button secondary"
              href={`${apiBase}/api/jobs/${activeJob.id}/download`}
            >
              <Download size={16} /> Download to view
            </a>
          </div>
        )}
        <div className="preview-status-overlay">
          <div className={`preview-status-badge ${statusLabel}`}>
            {statusLabel === 'edited' ? <Edit3 size={16} /> : <Printer size={16} />}
            <span>{statusLabel === 'edited' ? 'AI Edited' : 'Ready to Print'}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderPreview = (file, showOverlay = false, overlayType = '') => {
    if (!file) {
      return (
        <div className="preview-empty">
          <p>No document uploaded yet</p>
        </div>
      );
    }

    const fileType = file.type || '';
    const hasPreview = Boolean(file.previewUrl);
    const isImage = hasPreview && fileType.startsWith('image/');
    const isPDF =
      hasPreview &&
      (fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    // Anything we can't render inline (DOCX, or a PDF/image with no local
    // object URL) falls back to the document card. We NEVER render an iframe
    // with an empty/undefined src, which would otherwise resolve to the app
    // origin and show the PrintX website instead of the document.
    const canRenderInline = isImage || isPDF;

    return (
      <div className="preview-content-wrapper">
        {isImage && (
          <div className="preview-image-container">
            <img 
              src={file.previewUrl} 
              alt={file.name} 
              className="preview-image-full"
            />
          </div>
        )}

        {isPDF && (
          <div className="preview-pdf-container">
            <iframe
              src={`${file.previewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              title={file.name}
              className="preview-pdf-iframe"
              frameBorder="0"
            />
          </div>
        )}

        {!canRenderInline && (
          <div className="preview-document-fallback">
            <FileText size={64} className="preview-doc-icon-large" />
            <p className="preview-doc-name-large">{file.name}</p>
            <p className="preview-doc-size-large">{formatFileSize(file.size)}</p>
            <p className="preview-doc-type">{file.type || 'Document'}</p>
          </div>
        )}

        {showOverlay && (
          <div className="preview-status-overlay">
            <div className={`preview-status-badge ${overlayType}`}>
              {overlayType === 'edited' && (
                <>
                  <Edit3 size={16} />
                  <span>AI Enhanced</span>
                </>
              )}
              {overlayType === 'final' && (
                <>
                  <Printer size={16} />
                  <span>Print-Ready</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {!isOpen && uploadedFiles.length > 0 && (
        <button className="drawer-toggle" onClick={onClose}>
          <ChevronLeft size={20} />
        </button>
      )}

      <div className={`preview-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3 className="drawer-title">Document Preview</h3>
          <button className="drawer-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="drawer-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="drawer-preview-area">
          {activeTab === 'uploaded' && (
            uploadedFiles.length > 0 ? (
              renderPreview(uploadedFiles[uploadedFiles.length - 1])
            ) : (
              <div className="preview-empty">
                <FileText size={48} />
                <p>Upload a document to see preview</p>
              </div>
            )
          )}
          
          {activeTab === 'edited' && renderEdited('edited')}

          {activeTab === 'final' && renderEdited('final')}
        </div>

        {uploadedFiles.length > 0 && (
          <div className="drawer-footer">
            <div className="file-info-card">
              <FileText size={18} className="file-icon" />
              <div className="file-details-extended">
                <p className="file-name-footer">{uploadedFiles[uploadedFiles.length - 1].name}</p>
                <p className="file-meta-footer">
                  {formatFileSize(uploadedFiles[uploadedFiles.length - 1].size)} • 
                  {new Date(uploadedFiles[uploadedFiles.length - 1].uploadedAt).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
              </div>
              {editedReady ? (
                <a
                  className="file-download-btn"
                  title="Download edited document"
                  href={`${apiBase}/api/jobs/${activeJob.id}/download`}
                >
                  <Download size={16} />
                </a>
              ) : (
                <button className="file-download-btn" title="Download" disabled>
                  <Download size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PreviewDrawer;
