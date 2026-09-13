/**
 * The app renders translated copy and switches language at runtime — with no
 * API key and no network access, because translation already happened at build
 * time and the app only imports finished JSON.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../i18n'
import App from '../App'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('App', () => {
  it('renders English copy by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Project Dashboard')
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('interpolates values into a translated string', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Welcome back, Ada!')
  })

  it('picks the right plural form for the count', () => {
    render(<App />)
    expect(screen.getByText('You have 3 open tasks')).toBeInTheDocument()
    expect(screen.getByText('You have 1 open task')).toBeInTheDocument()
  })

  it('switches the whole UI to Spanish', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Español' }))

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('¡Bienvenido de nuevo, Ada!')
    expect(screen.getByText('Guardar cambios')).toBeInTheDocument()
    expect(screen.getByText('Tienes 3 tareas pendientes')).toBeInTheDocument()
  })

  it('renders markup inside a translated string via Trans', () => {
    render(<App />)
    const link = screen.getByRole('link', { name: 'Terms of Service' })
    expect(link).toHaveAttribute('href', 'https://example.com/terms')
  })

  it('keeps the embedded link when the language changes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))

    // The link text is now French, so match on the href rather than the name —
    // the point is that <Trans> still wires the anchor into the translated string.
    const links = screen.getAllByRole('link')
    const terms = links.find((a) => a.getAttribute('href') === 'https://example.com/terms')
    expect(terms).toBeDefined()
    expect(terms.textContent).not.toBe('Terms of Service')
  })
})
