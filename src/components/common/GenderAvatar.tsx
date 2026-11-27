import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type GenderAvatarProps = {
  gender?: string | null;
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
};

export function GenderAvatar({ gender, src, alt = "Avatar", className, fallbackClassName }: GenderAvatarProps) {
  const normalizedGender = String(gender || "").toUpperCase();
  const isFemale = normalizedGender === "F";
  const isMale = normalizedGender === "M";
  const tone = isFemale
    ? "bg-fuchsia-50 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200"
    : isMale
      ? "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
      : "bg-muted text-muted-foreground";

  return (
    <Avatar className={cn("relative shrink-0 overflow-hidden", className)}>
      {src ? <AvatarImage src={src} alt={alt} className="h-full w-full object-cover" /> : null}
      <AvatarFallback className={cn("relative flex h-full w-full items-center justify-center", tone, fallbackClassName)}>
        <UserRound className="h-[58%] w-[58%]" strokeWidth={1.7} aria-hidden="true" />
        {(isFemale || isMale) && (
          <span className="absolute bottom-0 right-0 flex h-[38%] w-[38%] items-center justify-center rounded-full border border-current/20 bg-background/90 text-[9px] font-bold leading-none">
            {isFemale ? "F" : "M"}
          </span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}
