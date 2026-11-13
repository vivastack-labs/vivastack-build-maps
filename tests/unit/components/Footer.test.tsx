import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Footer } from '@/components/Footer';

describe('Footer', () => {
  test('4.11.7：Footer は contentinfo のランドマークである', () => {
    // Arrange・Act
    render(<Footer />);

    // Assert
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });
});
