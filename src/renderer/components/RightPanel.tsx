import React, { useState } from 'react';
import type { LoadedExtension } from '../extension-loader';

interface RightPanelProps {
  extensions: LoadedExtension[];
}

export default function RightPanel({ extensions }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // rightPanel: true のページを収集
  const tabs = extensions.flatMap((ext) =>
    (ext.info.manifest.pages ?? [])
      .filter((p) => p.rightPanel)
      .map((p) => ({
        key: `${ext.info.id}:${p.id}`,
        extId: ext.info.id,
        pageId: p.id,
        title: p.title,
        icon: p.icon,
        Component: ext.rightPanels[p.id],
      }))
      .filter((t) => t.Component != null),
  );

  // タブが増減したとき、activeTab が存在しない場合は先頭を選択
  const resolvedActive = tabs.find((t) => t.key === activeTab)?.key ?? tabs[0]?.key ?? null;

  if (tabs.length === 0) {
    return (
      <div className="h-full w-full bg-aria-bg-light flex items-center justify-center">
        <p className="text-xs text-aria-text-muted px-4 text-center">右パネルを提供する拡張機能がありません</p>
      </div>
    );
  }

  const ActiveComponent = tabs.find((t) => t.key === resolvedActive)?.Component ?? null;

  return (
    <div className="h-full w-full bg-aria-bg-light flex flex-col overflow-hidden">
      {/* タブバー */}
      <div className="flex border-b border-aria-border shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            title={tab.title}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs shrink-0 border-b-2 transition-colors whitespace-nowrap ${
              resolvedActive === tab.key
                ? 'border-aria-primary text-aria-primary'
                : 'border-transparent text-aria-text-muted hover:text-aria-text hover:bg-aria-surface/30'
            }`}
          >
            <span className="text-sm leading-none">{tab.icon}</span>
            <span>{tab.title}</span>
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-2">{ActiveComponent && <ActiveComponent api={null as any} />}</div>
    </div>
  );
}
