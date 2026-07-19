import { parseHTML } from 'linkedom'
import type { Rule, RuleContext, RuleHitDraft } from '../types'

// 交易可信度规则组。当前版本只判断「是否有可达的政策页」，不从页面存在推断商家真实可靠。
// 配送/退货只适用于有明确购买链路的电商站，B2B 产品目录和询盘站不触发。

const CART_OR_CHECKOUT_PATH = /(?:^|\/)(?:cart|checkout|basket|bag)(?:\/|$)/i
const PRODUCT_PATH = /(?:^|\/)(?:product|products|shop|store|collection|collections|item|items)(?:\/|$)/i
const PURCHASE_CTA = /\b(?:add\s+to\s+(?:cart|bag)|buy\s+now|checkout|proceed\s+to\s+checkout|shop\s+now)\b/i
const SHIPPING_PATH = /(?:^|\/)(?:shipping|delivery|fulfillment|dispatch)(?:[\/_-]|$)/i
const RETURNS_PATH = /(?:^|\/)(?:return|returns|refund|refunds|exchange|exchanges)(?:[\/_-]|$)/i

interface EcommerceDetection {
  isEcommerce: boolean
  signals: string[]
}

function entryHasPurchaseCta(ctx: RuleContext): boolean {
  if (!ctx.entryPage) return false
  const { document } = parseHTML(ctx.entryPage.rawHtml)
  const values = [
    ...[...document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')].map((el) =>
      `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('value') ?? ''}`,
    ),
  ]
  return values.some((value) => PURCHASE_CTA.test(value.replace(/\s+/g, ' ').trim()))
}

// 保守识别：只凭 /products 不能判为电商，避免把询盘型 B2B 目录误入配送/退货诊断。
export function detectEcommerce(ctx: RuleContext): EcommerceDetection {
  const urls = ctx.siteAudit?.payload.pages.map((page) => page.url) ?? []
  const hasCartOrCheckout = urls.some((url) => CART_OR_CHECKOUT_PATH.test(new URL(url).pathname))
  const hasProductPath = urls.some((url) => PRODUCT_PATH.test(new URL(url).pathname))
  const hasPurchaseCta = entryHasPurchaseCta(ctx)
  const signals: string[] = []
  if (hasCartOrCheckout) signals.push('cart_or_checkout_path')
  if (hasProductPath) signals.push('product_path')
  if (hasPurchaseCta) signals.push('purchase_cta')

  return {
    isEcommerce: hasCartOrCheckout || (hasProductPath && hasPurchaseCta),
    signals,
  }
}

function hasPolicyPage(ctx: RuleContext, pattern: RegExp): boolean {
  return (ctx.siteAudit?.payload.pages ?? []).some((page) => {
    if (page.checkStatus !== 'checked' || page.httpStatus !== 200) return false
    try {
      return pattern.test(new URL(page.url).pathname)
    } catch {
      return false
    }
  })
}

function ecommerceEvidence(ctx: RuleContext): string[] {
  const refs = [ctx.siteAudit?.id, ctx.entryPage?.id].filter((id): id is string => Boolean(id))
  return refs
}

const TR04: Rule = {
  id: 'TR04',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.siteAudit) return null
    const ecommerce = detectEcommerce(ctx)
    if (!ecommerce.isEcommerce || hasPolicyPage(ctx, SHIPPING_PATH)) return null
    return {
      title: '电商站未发现配送说明页',
      description: '站内识别到明确购买链路，但未发现可达的配送/发货说明页。陌生买家难以预期从何处发货、何时送达及异常配送如何处理；此项仅适用于电商站。',
      evidenceRefs: ecommerceEvidence(ctx),
      scope: 'commerce:shipping-policy',
      detail: { ecommerceSignals: ecommerce.signals, affectedCount: 1 },
    }
  },
}

const TR05: Rule = {
  id: 'TR05',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.siteAudit) return null
    const ecommerce = detectEcommerce(ctx)
    if (!ecommerce.isEcommerce || hasPolicyPage(ctx, RETURNS_PATH)) return null
    return {
      title: '电商站未发现退货退款说明页',
      description: '站内识别到明确购买链路，但未发现可达的退货/退款说明页。陌生买家无法预判退货窗口、运费承担和退款处理方式；此项仅适用于电商站。',
      evidenceRefs: ecommerceEvidence(ctx),
      scope: 'commerce:returns-policy',
      detail: { ecommerceSignals: ecommerce.signals, affectedCount: 1 },
    }
  },
}

export const trustRules: Rule[] = [TR04, TR05]
