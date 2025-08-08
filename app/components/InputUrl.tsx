"use client";

import { useFormStatus } from "react-dom";

type Props = {
  defaultValue: string;
};

export default function InputUrl({ defaultValue }: Props) {
  const { pending } = useFormStatus();
  return (
    <div className="relative">
      <input
        id="url"
        name="url"
        type="url"
        required
        defaultValue={defaultValue}
        placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
        disabled={pending}
        aria-disabled={pending}
        className="w-full rounded-xl border-2 border-slate-200 px-4 py-4 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-4">
        {pending ? (
          <svg
            className="w-5 h-5 animate-spin text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
