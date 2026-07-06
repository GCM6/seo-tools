export interface RenderResult {
  html: string
  mainTextChars: number
}

export interface RenderProvider {
  isConfigured?(): boolean
  renderMainText(url: string): Promise<RenderResult>
}
