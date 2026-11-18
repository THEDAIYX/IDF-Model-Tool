# IDF 三维模型管理平台

双击 `启动IDF平台.cmd` 即可启动。这个入口会自动寻找 Node.js；如果系统没有配置 Node.js，也会切换到 PowerShell 内置静态服务，至少可以打开页面和示例模型。

手动启动（已安装 Node.js 且已加入 PATH）：

```powershell
node server.mjs
```

浏览器打开启动脚本打印的地址（通常是 `http://127.0.0.1:4173/`；如果被占用会自动切换到 4174–4183）。
