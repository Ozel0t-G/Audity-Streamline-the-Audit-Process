import { useLicense } from "../license/LicenseProvider";

/** Persistent "DEMO" badge in the header while a demo license is active. */
export function DemoWatermark() {
  const { state } = useLicense();
  if (!state.watermark) return null;
  return (
    <span
      className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400"
      title="Demo instance — all features active, sample data"
    >
      Demo
    </span>
  );
}
