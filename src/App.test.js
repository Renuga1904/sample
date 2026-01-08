import { render, screen } from '@testing-library/react';
import App from './App';

test('renders open converter button', () => {
  render(<App />);
  const buttonElement = screen.getByText(/open converter/i);
  expect(buttonElement).toBeInTheDocument();
});
