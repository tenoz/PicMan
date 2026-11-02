/**
 * ImageTypeBadge 单测：扩展名 → 图标/颜色映射，以及点击预览回调
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageTypeBadge } from '../ImageTypeBadge';

/** 取出渲染出来的 svg，方便断言着色类 */
const svgOf = (container: HTMLElement) => container.querySelector('svg') as SVGSVGElement;

describe('ImageTypeBadge', () => {
  it('JPG 用天蓝色、标题带 JPG', () => {
    const { container } = render(<ImageTypeBadge name="a.jpg" />);
    expect(screen.getByTitle(/JPG/)).toBeTruthy();
    expect(svgOf(container).getAttribute('class')).toContain('text-sky-500');
  });

  it('扩展名大小写不敏感（.JPG 等价 .jpg）', () => {
    const { container } = render(<ImageTypeBadge name="A.JPG" />);
    expect(svgOf(container).getAttribute('class')).toContain('text-sky-500');
  });

  it('PNG / GIF 各有独立颜色', () => {
    const png = render(<ImageTypeBadge name="a.png" />);
    expect(svgOf(png.container).getAttribute('class')).toContain('text-emerald-500');

    const gif = render(<ImageTypeBadge name="a.gif" />);
    expect(svgOf(gif.container).getAttribute('class')).toContain('text-amber-500');
  });

  it('不认识的扩展名回退灰色通用图标', () => {
    const { container } = render(<ImageTypeBadge name="a.tiff" />);
    expect(screen.getByTitle(/TIFF/)).toBeTruthy();
    expect(svgOf(container).getAttribute('class')).toContain('text-gray-400');
  });

  it('没有扩展名时不崩，标题显示「文件」', () => {
    render(<ImageTypeBadge name="noext" />);
    expect(screen.getByTitle(/^文件/)).toBeTruthy();
  });

  it('点击触发一次回调', () => {
    const onClick = vi.fn();
    render(<ImageTypeBadge name="a.webp" onClick={onClick} />);
    fireEvent.click(screen.getByTitle(/WEBP/));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
