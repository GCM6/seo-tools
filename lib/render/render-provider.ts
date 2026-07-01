export interface RenderResult {
  html: string
  mainTextChars: number
}

export interface RenderProvider {
  renderMainText(url: string): Promise<RenderResult>
}
