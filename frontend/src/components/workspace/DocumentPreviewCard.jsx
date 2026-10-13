import React from 'react';
import { FileText, File } from 'lucide-react';
import { formatFileSize } from '../../services/fileService';
import '../../styles/workspace.css';

const DocumentPreviewCard = ({ file }) => {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isDOCX = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.name.toLowerCase().endsWith('.docx') ||
                 file.name.toLowerCase().endsWith('.doc');
  const isImage = file.type.startsWith('image/');

  return (
    <div className="doc-preview-card">
      <div className="doc-preview-thumbnail">
        {isImage ? (
          <img src={file.previewUrl} alt={file.name} className="doc-preview-image" />
        ) : (
          <div className="doc-preview-placeholder">
            {isPDF && (
              <div className="doc-preview-page">
                <div className="doc-preview-lines">
                  <div className="doc-line"></div>
                  <div className="doc-line"></div>
                  <div className="doc-line short"></div>
                  <div className="doc-line"></div>
                  <div className="doc-line short"></div>
                </div>
                <div className="doc-preview-footer">
                  <FileText size={16} />
                  <span>PDF</span>
                </div>
              </div>
            )}
            {isDOCX && (
              <div className="doc-preview-page">
                <div className="doc-preview-lines">
                  <div className="doc-line"></div>
                  <div className="doc-line"></div>
                  <div className="doc-line"></div>
                  <div className="doc-line short"></div>
                  <div className="doc-line"></div>
                </div>
                <div className="doc-preview-footer">
                  <File size={16} />
                  <span>DOCX</span>
                </div>
              </div>
            )}
            {!isPDF && !isDOCX && (
              <div className="doc-preview-page">
                <div className="doc-preview-center">
                  <FileText size={32} />
                  <span className="doc-preview-ext">{file.name.split('.').pop().toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="doc-preview-info">
        <div className="doc-preview-header">
          <FileText size={16} className="doc-preview-icon" />
          <span className="doc-preview-name">{file.name}</span>
        </div>
        <span className="doc-preview-size">{formatFileSize(file.size)}</span>
      </div>
    </div>
  );
};

export default DocumentPreviewCard;
