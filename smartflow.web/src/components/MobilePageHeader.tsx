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
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-pure-aqua/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-pure-aqua" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 truncate tracking-tight">{title}</h1>
          {subtitle && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
