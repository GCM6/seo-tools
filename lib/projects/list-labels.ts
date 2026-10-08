type Translate = ((key: string, vars?: Record<string, string | number | Date>) => string) & { raw: (key: string) => unknown }

// ProjectList 的文案在首页和项目列表两处一样，集中在这里拼，避免两处各写一份漏 key。
// t = projects 命名空间，tr = retest 命名空间（回测三态文案复用，spec §4/i18n）。
export function projectListLabels(t: Translate, tr: Translate) {
  return {
    newAnalysis: t('newAnalysis'),
    colDomain: t('colDomain'),
    colMarket: t('colMarket'),
    colLatest: t('colLatest'),
    colFindings: t('colFindings'),
    colGsc: t('colGsc'),
    colRetest: t('colRetest'),
    colAction: t('colAction'),
    empty: t('empty'),
    emptyHint: t('emptyHint'),
    noRun: t('noRun'),
    retestNone: t('retestNone'),
    findingsUnit: t.raw('findingsUnit') as string,
    actionRunning: t('actionRunning'),
    actionRetest: t('actionRetest'),
    actionReconfigure: t('actionReconfigure'),
    actionConfigure: t('actionConfigure'),
    retestStarting: tr('starting'),
    retestError: tr('error'),
    retestInProgress: tr('inProgress'),
    retestNeedsSetup: tr('needsSetup'),
    searchLabel: t('searchLabel'),
    searchPlaceholder: t('searchPlaceholder'),
    searchEmpty: t.raw('searchEmpty') as string,
    clearSearch: t('clearSearch'),
    gscConnected: t('gscConnected'),
    gscPending: t('gscPending'),
  }
}

