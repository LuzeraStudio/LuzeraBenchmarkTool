import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    // Add webkitdirectory attribute as an optional string
    webkitdirectory?: string;
  }
}