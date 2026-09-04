  • electron-builder  version=26.15.3 os=10.0.26200
  • loaded configuration  file=package.json ("build" field)
  • executing @electron/rebuild  electronVersion=35.7.5 arch=x64 buildFromSource=false workspaceRoot=D:\Develop\h-family\hcode\desktop projectDir=./ appDir=./
  • installing native dependencies  arch=x64
  • completed installing native dependencies
  • packaging       platform=win32 arch=x64 electron=35.7.5 appOutDir=release\win-unpacked
  • using custom unpacked Electron distribution  electronDist=node_modules\electron\dist
  • copying unpacked Electron  source=D:\Develop\h-family\hcode\desktop\node_modules\electron\dist destination=D:\Develop\h-family\hcode\desktop\release\win-unpacked
  • searching for node modules  pm=npm searchDir=D:\Develop\h-family\hcode\desktop
  • searching for node modules  pm=traversal searchDir=D:\Develop\h-family\hcode\desktop
  • using manual traversal of node_modules to build dependency tree
  • no node modules returned while searching directories  searchDirectories=[""]
  • updating asar integrity executable resource  executablePath=release\win-unpacked\HCode.exe
  • default Electron icon is used  reason=application icon is not set
  • signing with signtool.exe  path=release\win-unpacked\HCode.exe
  • building        target=nsis file=release\HCode Setup 0.1.0.exe archs=x64 oneClick=true perMachine=false
  • signing with signtool.exe  path=release\win-unpacked\resources\elevate.exe
  • signing with signtool.exe  path=release\HCode Setup 0.1.0.__uninstaller.exe
  • signing with signtool.exe  path=release\HCode Setup 0.1.0.exe
  • building block map  blockMapFile=release\HCode Setup 0.1.0.exe.blockmap
