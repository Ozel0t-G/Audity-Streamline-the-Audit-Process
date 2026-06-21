import lockupDark from "../assets/audity-lockup-dark.svg";
import lockupLight from "../assets/audity-lockup-light.svg";

export function BrandMark({ variant }: { variant?: "icon" | "lockup" } = {}) {
  if (variant === "icon") {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center">
        <img className="h-7 w-7 object-contain dark:hidden" src={lockupLight} alt="" aria-hidden="true" />
        <img className="hidden h-7 w-7 object-contain dark:block" src={lockupDark} alt="" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 items-center" aria-label="Audity">
      <img className="block h-7 w-auto dark:hidden" src={lockupLight} alt="Audity" />
      <img className="hidden h-7 w-auto dark:block" src={lockupDark} alt="Audity" />
    </span>
  );
}
