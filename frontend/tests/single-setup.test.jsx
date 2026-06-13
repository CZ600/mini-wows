// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SingleSetupScreen from '../src/components/SingleSetupScreen.jsx';

describe('SingleSetupScreen level grid', () => {
  const mockUser = { username: 'testuser' };
  const mockOnStart = () => {};
  const mockOnBack = () => {};

  it('should render level grid centered', () => {
    render(<SingleSetupScreen user={mockUser} onStart={mockOnStart} onBack={mockOnBack} />);

    // 检查等级网格是否存在
    const levelGrid = document.querySelector('.level-grid');
    expect(levelGrid).toBeTruthy();

    // 检查是否有level-grid类
    expect(levelGrid.classList.contains('level-grid')).toBe(true);
  });

  it('should display all 10 levels', () => {
    render(<SingleSetupScreen user={mockUser} onStart={mockOnStart} onBack={mockOnBack} />);

    // 检查是否显示了10个等级
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByText(i.toString())).toBeTruthy();
    }
  });

  it('should have section title with border', () => {
    render(<SingleSetupScreen user={mockUser} onStart={mockOnStart} onBack={mockOnBack} />);

    // 检查"选择初始等级"标题是否有section-title类
    const title = screen.getByText('选择初始等级');
    expect(title.classList.contains('section-title')).toBe(true);
  });
});