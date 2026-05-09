import React, { forwardRef } from 'react';
import { Widget } from '../types';
import { JsonLiveWidget, ControlWidget, RealTimeTable, LogsWidget, IPadSimulator, SendEventWidget } from './Widgets';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WidgetContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  widget: Widget;
  isDragging?: boolean;
}

export const WidgetContainer = forwardRef<HTMLDivElement, WidgetContainerProps>(
  ({ widget, className, style, children, onMouseDown, onMouseUp, onTouchEnd, isDragging, ...props }, ref) => {
    const renderWidget = () => {
      switch (widget.type) {
        case 'json':
          return <JsonLiveWidget />;
        case 'table':
          return <RealTimeTable />;
        case 'logs':
          return <LogsWidget />;
        case 'control':
          return <ControlWidget />;
        case 'ipad':
          return <IPadSimulator />;
        case 'send-event':
          return <SendEventWidget />;
        default:
          return <div className="p-4">Widget {widget.id} ({widget.type})</div>;
      }
    };

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm flex flex-col group",
          isDragging ? "shadow-lg scale-[1.02] z-40 ring-2 ring-blue-500/50" : "transition-all duration-200",
          className
        )}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        <div className="h-2 w-full bg-transparent group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900/50 transition-colors cursor-move flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 rounded-t-xl">
           <div className="w-6 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>
        <div className="flex-1 overflow-hidden rounded-b-xl relative">
           {renderWidget()}
        </div>
        {/* Resize handles will be rendered here as children by RGL */}
        {children}
      </div>
    );
  }
);

WidgetContainer.displayName = 'WidgetContainer';
