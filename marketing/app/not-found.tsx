import Link from 'next/link'

// 营销站 404：与其他正文页同版式，给出回首页的出口，而不是 Next 默认的空白页。
export default function NotFound() {
  return (
    <main className="mk-wrap mk-page">
      <header className="mk-page__head">
        <h1>Page not found</h1>
        <p className="mk-page__lead">The link may be out of date, or the page has moved.</p>
      </header>
      <Link className="btn btn--primary" href="/">
        Back to home
      </Link>
    </main>
  )
}
