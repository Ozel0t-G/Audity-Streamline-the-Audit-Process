import { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "full";
  style?: CSSProperties;
};

const ROUNDED: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded",
  md: "rounded-audity",
  full: "rounded-full"
};

export function Skeleton({ className = "", width, height, rounded = "md", style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`audity-skeleton inline-block ${ROUNDED[rounded]} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style
      }}
    />
  );
}

type SkeletonTextProps = {
  lines?: number;
  className?: string;
};

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={10}
          width={index === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

export function TableSkeleton({ rows = 5, columns = 4, className = "" }: TableSkeletonProps) {
  return (
    <div
      className={`overflow-hidden rounded-audity border border-audity-border ${className}`}
      role="status"
      aria-label="Loading"
    >
      <div className="border-b border-audity-border bg-audity-tableHeader px-3 py-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} height={10} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-audity-border bg-audity-panel">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-3 py-2.5">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton key={colIndex} height={12} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type CardSkeletonProps = {
  className?: string;
};

export function CardSkeleton({ className = "" }: CardSkeletonProps) {
  return (
    <div className={`audity-card ${className}`} role="status" aria-label="Loading">
      <Skeleton height={14} width="40%" className="mb-3" />
      <SkeletonText lines={3} />
    </div>
  );
}

type PageSkeletonProps = {
  cards?: number;
  showTable?: boolean;
};

export function PageSkeleton({ cards = 3, showTable = true }: PageSkeletonProps) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <div>
        <Skeleton height={12} width={120} className="mb-2" />
        <Skeleton height={24} width="40%" className="mb-2" />
        <Skeleton height={12} width="70%" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
      {showTable ? <TableSkeleton rows={5} columns={4} /> : null}
    </div>
  );
}
