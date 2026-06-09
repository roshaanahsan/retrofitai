import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMomentumColor(score: number): string {
  if (score <= 40) return 'bg-red-500 text-white';
  if (score <= 70) return 'bg-amber-500 text-black';
  return 'bg-emerald-500 text-black';
}

export function getVerdictStyle(verdict: string) {
  switch (verdict) {
    case 'APPLY_NOW':
      return { label: 'Apply Now', className: 'text-emerald-500 font-bold text-base' };
    case 'APPLY_WITH_EDITS':
      return { label: 'Apply With Edits', className: 'text-amber-500 font-bold text-base' };
    case 'SKIP':
      return { label: 'Skip This One', className: 'text-red-500 font-bold text-base' };
    default:
      return { label: verdict, className: 'text-zinc-400 font-bold text-base' };
  }
}

export function getStatusBadgeStyle(status: string): Record<string, string | number> {
  switch (status) {
    case 'APPLIED':
      return { background: '#27272A', color: '#D4D4D8' };
    case 'NO_RESPONSE':
      return { background: 'rgba(28,20,0,0.8)', color: '#FBBF24' };
    case 'PHONE_SCREEN':
      return { background: '#001a22', color: '#67e8f9' };
    case 'INTERVIEW':
      return { background: 'rgba(2,44,34,0.8)', color: '#34D399' };
    case 'OFFER':
      return { background: '#10B981', color: '#FFFFFF', fontWeight: 600 };
    case 'REJECTED':
      return { background: 'rgba(69,10,10,0.5)', color: '#F87171' };
    default:
      return { background: '#27272A', color: '#A1A1AA' };
  }
}

export function formatStatus(status: string): string {
  switch (status) {
    case 'NO_RESPONSE':  return 'No Response';
    case 'PHONE_SCREEN': return 'Phone Screen';
    case 'APPLIED':      return 'Applied';
    case 'INTERVIEW':    return 'Interview';
    case 'OFFER':        return 'Offer';
    case 'REJECTED':     return 'Rejected';
    default:             return status;
  }
}

export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export function formatRelativeDate(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// Re-export for backwards compat
export function getStatusBadgeClass(_status: string): string { return ''; }
