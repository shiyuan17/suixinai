import React from 'react';

const SidebarNewTaskIcon: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 9h8" />
      <path d="M8 13h6" />
      <path d="M12.01 18.594 8 21v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5.5" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
    </svg>
  );
};

export default SidebarNewTaskIcon;
