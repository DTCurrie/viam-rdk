import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Collapse from './collapse.spec.svelte';

describe('Collapse', () => {
  it('Renders the heading correctly', () => {
    render(Collapse);
    expect(screen.getByText('Test Collapse')).toBeInTheDocument();
  });

  it('Renders the contents of information slot correctly', () => {
    render(Collapse);
    expect(screen.getByText('Busy')).toBeInTheDocument();
  });

  it('Renders the contents of title slot correctly', () => {
    render(Collapse);
    expect(screen.getByText('Howdy')).toBeInTheDocument();
    expect(screen.getByText('Hey')).toBeInTheDocument();
  });

  it('Renders content slot correctly when open', async () => {
    const { component } = render(Collapse);
    const onToggle = vi.fn();
    component.$on('toggle', onToggle);
    await fireEvent.click(screen.getByText('Test Collapse'));
    const contentDiv = screen.getByText('This is the content.');
    expect(contentDiv).toBeVisible();
  });

  it('Hides content slot correctly when closed', () => {
    render(Collapse);
    const contentDiv = screen.queryByText('This is the content.');
    expect(contentDiv).not.toBeInTheDocument();
  });
});
