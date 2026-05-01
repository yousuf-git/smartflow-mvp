import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export default function MobilePageHeader({ icon: Icon, title, subtitle, action }: Props) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-aqua-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-aqua-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
