#!/usr/bin/env python3
"""递增 index.html 的静态资源缓存版本号 (?v=N)。

新版本 = max(当前文件里的版本, git HEAD 同文件里的版本) + 1，
避免 main 上的旧版本号与已部署版本撞号（撞号会让浏览器命中旧缓存）。
在 website 分支上、同步 main 的文件之后、提交之前调用。
"""
import re
import subprocess
import sys

PATH = 'index.html'

def version_of(text):
    m = re.search(r'\?v=(\d+)', text)
    return int(m.group(1)) if m else 0

def main():
    s = open(PATH, encoding='utf-8').read()
    head = subprocess.run(['git', 'show', f'HEAD:{PATH}'],
                          capture_output=True, text=True, encoding='utf-8').stdout
    n = max(version_of(s), version_of(head)) + 1
    open(PATH, 'w', encoding='utf-8', newline='\n').write(re.sub(r'\?v=\d+', f'?v={n}', s))
    print(f'cache version -> {n}')

if __name__ == '__main__':
    sys.exit(main())
