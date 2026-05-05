import { MessageCircle } from 'lucide-react';

interface Props {
  onNavigateToWhatsApp?: () => void;
}

export function WhatsAppFloatingButton({ onNavigateToWhatsApp }: Props) {
  const handleClick = () => {
    if (onNavigateToWhatsApp) {
      onNavigateToWhatsApp();
    }
  };

  return (
    <div className="whatsapp-float-container">
      <button
        className="whatsapp-float-btn"
        onClick={handleClick}
        aria-label="Send Invoice via WhatsApp"
        title="Send Invoice via WhatsApp"
      >
        {/* WhatsApp SVG icon */}
        <svg viewBox="0 0 32 32" width="28" height="28" fill="white">
          <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.129 6.742 3.047 9.379L1.054 31.25l6.1-1.953A15.9 15.9 0 0016.004 32C24.826 32 32 24.822 32 16S24.826 0 16.004 0zm9.31 22.596c-.39 1.1-1.932 2.013-3.178 2.28-.852.18-1.965.324-5.71-1.227-4.796-1.985-7.878-6.84-8.115-7.156-.228-.316-1.91-2.544-1.91-4.855 0-2.311 1.21-3.447 1.638-3.918.43-.47.936-.588 1.248-.588.313 0 .625.003.898.016.288.014.675-.109.956.729.39 1.036.975 2.612 1.06 2.802.085.19.143.414.028.666-.114.252-.171.409-.342.632-.171.223-.362.497-.517.667-.171.185-.35.386-.15.758.2.371.887 1.463 1.905 2.37 1.31 1.168 2.413 1.53 2.757 1.701.342.171.543.143.742-.086.2-.228.856-.999 1.085-1.342.228-.342.457-.285.77-.171.313.114 1.99.938 2.332 1.109.342.171.57.257.656.399.086.143.086.828-.304 1.928z"/>
        </svg>
        <span className="whatsapp-pulse" />
      </button>
    </div>
  );
}
