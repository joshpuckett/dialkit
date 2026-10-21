interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    onClick: () => void;
  }>;
}

export function ButtonGroup({ buttons }: ButtonGroupProps) {
  return (
    <div className="dialkit-button-group">
      {buttons.map((button, index) => (
        <button
          key={index}
          type="button"
          className="dialkit-button"
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
