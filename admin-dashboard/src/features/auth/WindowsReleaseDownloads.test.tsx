import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowsReleaseDownloads } from './WindowsReleaseDownloads';

describe('WindowsReleaseDownloads', () => {
  afterEach(cleanup);
  it('renders adjacent installer and portable links', () => {
    render(<WindowsReleaseDownloads version="1.4.0" installerUrl="/installer.zip" portableUrl="/portable.zip" />);
    const installer = screen.getByRole('link', { name: /download installer v1\.4\.0/i });
    const portable = screen.getByRole('link', { name: /download portable v1\.4\.0/i });
    expect(installer).toHaveAttribute('href', '/installer.zip');
    expect(portable).toHaveAttribute('href', '/portable.zip');
    expect(installer.parentElement).toBe(portable.parentElement);
    expect(screen.getByText(/entire adjacent/i)).toHaveTextContent('FCMData');
  });
  it('hides the portable link for older releases without one', () => {
    render(<WindowsReleaseDownloads version="1.3.100" installerUrl="/installer.zip" portableUrl={null} />);
    expect(screen.getByRole('link', { name: /download installer v1\.3\.100/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download portable/i })).not.toBeInTheDocument();
  });
});
