import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'quiet';

export function buttonClass(variant: ButtonVariant = 'default', small = false): string {
  return [styles.button, variant !== 'default' ? styles[variant] : '', small ? styles.small : ''].filter(Boolean).join(' ');
}

export function Button({
  variant = 'default',
  small = false,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  return <button type={type} className={[buttonClass(variant, small), className].filter(Boolean).join(' ')} {...rest} />;
}
