import type { CSSProperties } from 'react';

/** 允许 CSS 自定义属性（--place-color 等）通过 React style 对象写入。 */
export type CustomCSS = CSSProperties & Record<`--${string}`, string | number>;
