import logoUrl from "../assets/audity-logo.png";

export function BrandMark() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-audity border border-audity-borderStrong bg-audity-panel p-1">
      <img className="h-full w-full object-contain" src={logoUrl} alt="Audity logo" />
    </div>
  );
}
