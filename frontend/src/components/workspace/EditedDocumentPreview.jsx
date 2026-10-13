import React from 'react';
import { FileText, Printer, Download, Eye } from 'lucide-react';
import '../../styles/workspace.css';

const EditedDocumentPreview = ({ doc, onPrintClick }) => {
  // Prefer the real Backend preview/download URLs; fall back to `url` for
  // backward compatibility with any older callers.
  const previewUrl = doc.previewUrl || doc.url;
  const downloadUrl = doc.downloadUrl || doc.url;

  const handlePrint = () => {
    // Trigger chat flow instead of alert
    if (onPrintClick) {
      onPrintClick();
    }
  };

  const handleView = () => {
    window.open(previewUrl, '_blank');
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = doc.name;
    link.click();
  };

  return (
    <div className="edited-doc-preview">
      <div className="edited-doc-header">
        <div className="edited-doc-icon">
          <FileText size={20} />
        </div>
        <div className="edited-doc-title">
          <h4>Edited Document Ready</h4>
          <p>{doc.name}</p>
        </div>
      </div>

      <div className="edited-doc-iframe-container">
        <iframe
          src={previewUrl}
          title="Edited Document Preview"
          className="edited-doc-iframe"
        />
      </div>

      <div className="edited-doc-actions">
        <button 
          className="doc-action-button secondary"
          onClick={handleView}
          title="View in new tab"
        >
          <Eye size={18} />
          <span>View Full</span>
        </button>
        
        <button 
          className="doc-action-button secondary"
          onClick={handleDownload}
          title="Download document"
        >
          <Download size={18} />
          <span>Download</span>
        </button>
        
        <button 
          className="doc-action-button primary"
          onClick={handlePrint}
          title="Send to print"
        >
          <Printer size={18} />
          <span>Print Document</span>
        </button>
      </div>
    </div>
  );
};

export default EditedDocumentPreview;
