import { Link } from 'react-router-dom'

export function NotFoundRoute() {
  return (
    <section>
      <h1>404</h1>
      <p style={{ color: 'var(--dim)' }}>Halaman tidak ada.</p>
      <Link to="/" style={{ color: 'var(--accent)' }}>
        Kembali ke feed
      </Link>
    </section>
  )
}
