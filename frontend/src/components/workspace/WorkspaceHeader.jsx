import React from 'react';
import PrintXLogo from '../PrintXLogo';
import '../../styles/workspace.css';

const WorkspaceHeader = () => {
  return (
    <div className="workspace-header">
      <div className="workspace-header-left">
        <PrintXLogo size={30} />
      </div>

      <div className="workspace-header-right">
        <div className="workspace-status">
          <span className="status-indicator"></span>
          <span className="status-text">Online</span>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceHeader;
