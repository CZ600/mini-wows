// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExitConfirmModal from '../src/components/ExitConfirmModal.jsx';

describe('ExitConfirmModal', () => {
  it('visible=false 时不渲染', () => {
    const { container } = render(<ExitConfirmModal visible={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container.querySelector('#exit-confirm-modal')).toBeNull();
  });

  it('visible=true 时渲染弹窗', () => {
    render(<ExitConfirmModal visible={true} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('退出游戏')).toBeTruthy();
  });

  it('显示提示文案', () => {
    render(<ExitConfirmModal visible={true} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/确定要退出当前游戏/)).toBeTruthy();
    expect(screen.getByText(/返回主菜单/)).toBeTruthy();
  });

  it('点击取消按钮触发 onCancel', () => {
    const onCancel = vi.fn();
    render(<ExitConfirmModal visible={true} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('点击确认按钮触发 onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ExitConfirmModal visible={true} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('确定退出'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点击背景遮罩触发 onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(<ExitConfirmModal visible={true} onConfirm={() => {}} onCancel={onCancel} />);
    const backdrop = container.querySelector('.modal-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('点击弹窗内部不触发 onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(<ExitConfirmModal visible={true} onConfirm={() => {}} onCancel={onCancel} />);
    const modal = container.querySelector('.modal-card');
    fireEvent.click(modal);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
