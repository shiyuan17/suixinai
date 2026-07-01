import React from 'react';

const SidebarAutomationIcon: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M12 21a7.2 7.2 0 1 0 0-14.4A7.2 7.2 0 0 0 12 21Z"
      />
      <path d="M7.2 3.6 4.6 5.8" />
      <path d="M16.8 3.6 19.4 5.8" />
      <path d="M12 10.2v3.3l2.4 1.5" />
      <path d="M8.8 22 7.6 20.4" />
      <path d="M15.2 22 16.4 20.4" />
    </svg>
  );
};

export default SidebarAutomationIcon;
