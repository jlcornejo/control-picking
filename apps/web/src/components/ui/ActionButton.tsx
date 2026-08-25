interface ActionButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  children: React.ReactNode;
  disabled?: boolean;
}

export function ActionButton({ onClick, variant = 'primary', children, disabled }: ActionButtonProps) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50';
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:bg-primary/90',
    ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
    danger: 'text-red-600 hover:bg-red-50',
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}
