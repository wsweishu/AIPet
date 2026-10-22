import React, { useState } from 'react';
import { Check, Copy, Download, Fish, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { claimPet } from '@client/src/api';
import type { PetClaimResponse } from '@shared/api.interface';

// Puts the visitor's own platform first; both downloads stay available.
const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

interface CopyLineProps {
  text: string;
}

const CopyLine: React.FC<CopyLineProps> = ({ text }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-sm">
      <span className="min-w-0 flex-1 break-all">{text}</span>
      <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="复制">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
};

const ClaimPage: React.FC = () => {
  const [claim, setClaim] = useState<PetClaimResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleClaim = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setClaim(await claimPet());
    } catch {
      setError('领取失败，请刷新页面后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Fish className="h-7 w-7 text-primary" />
            AIPet 肥鱼
          </h1>
          <p className="text-muted-foreground">
            住在桌面上的「蓝色大肥鱼」女仆鲸鱼娘：点她聊天，她用豆包回答，还能用你自己的 lark-cli 查你的飞书日程和待办（只读）。
          </p>
        </header>

        {!claim ? (
          <Card>
            <CardHeader>
              <CardTitle>领取你的肥鱼</CardTitle>
              <CardDescription>领取后会显示下载链接和安装步骤。支持 Apple 芯片的 Mac 和 64 位 Windows。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleClaim} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fish className="mr-2 h-4 w-4" />}
                领取肥鱼
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        ) : (
          <Card data-ai-section-type="claim-result">
            <CardHeader>
              <CardTitle>{claim.userName ? `${claim.userName}，肥鱼准备好啦` : '肥鱼准备好啦'}</CardTitle>
              <CardDescription>按下面的步骤装好就能聊天。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant={IS_WINDOWS ? 'outline' : 'default'}>
                  <a href={claim.downloadUrlMac} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    下载肥鱼（macOS）
                  </a>
                </Button>
                <Button asChild variant={IS_WINDOWS ? 'default' : 'outline'}>
                  <a href={claim.downloadUrlWin} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    下载肥鱼（Windows）
                  </a>
                </Button>
              </div>
              <ol className="list-decimal space-y-4 pl-5 text-sm leading-6">
                <li>
                  {IS_WINDOWS ? (
                    <>
                      解压到任意文件夹，双击「AIPet.exe」。应用没有签名，如果出现「Windows 已保护你的电脑」，点<b>更多信息 → 仍要运行</b>。肥鱼不占任务栏，在右下角托盘里能找到她。
                    </>
                  ) : (
                    <>
                      解压后把「AIPet 肥鱼.app」拖进「应用程序」。应用没有签名，第一次打开要<b>右键 → 打开</b>。
                    </>
                  )}
                </li>
                <li>
                  打开后在设置里选「飞书登录」，妙搭地址填下面这个，再点「飞书登录…」完成登录：
                  <CopyLine text={claim.appUrl} />
                </li>
                <li>
                  安装飞书命令行 lark-cli（需要 Node.js），再创建你自己的 CLI 应用，按浏览器里的提示完成：
                  <CopyLine text="npm install -g @larksuite/cli" />
                  <CopyLine text="lark-cli config init --new" />
                </li>
                <li>
                  第一次问「今天有什么会」时，肥鱼会打开飞书授权页，申请这些只读权限：
                  <ul className="mt-1 list-disc pl-5 font-mono text-xs text-muted-foreground">
                    {claim.scopes.map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  如果页面提示需要管理员审批，等审批通过后再问一次。
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                鲸鱼娘动画来自 PC2005-cloud/dsh-pet，禁止商用。源码：github.com/wsweishu/AIPet
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ClaimPage;
