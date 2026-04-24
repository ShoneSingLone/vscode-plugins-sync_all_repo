# Sync All Repos 插件 - 扫描功能改进实现计划

## [ ] Task 1: 移除自动扫描逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 修改 extension.ts 文件，移除插件激活时的自动扫描逻辑
  - 确保插件启动后保持空闲状态，不执行任何扫描操作
  - 添加详细的启动日志输出
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-1.1: 插件启动后不自动扫描仓库
  - `programmatic` TR-1.2: 插件激活时无扫描相关的网络或文件系统操作
  - `programmatic` TR-1.3: 启动过程中有详细的日志输出
- **Notes**: 保留其他启动逻辑，只移除扫描相关代码

## [ ] Task 2: 实现手动扫描按钮
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 修改 ui.ts 文件，在界面中添加扫描按钮
  - 实现扫描按钮的点击事件处理
  - 添加扫描过程的状态指示
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-2.1: 界面中存在扫描按钮
  - `human-judgment` TR-2.2: 点击扫描按钮后开始扫描过程
  - `human-judgment` TR-2.3: 扫描过程中有进度指示
- **Notes**: 扫描按钮应放置在界面的明显位置

## [ ] Task 3: 实现只扫描当前项目文件夹的功能
- **Priority**: P0
- **Depends On**: Task 2
- **Description**:
  - 修改扫描逻辑，只扫描当前活动的项目文件夹
  - 使用 VS Code API 获取当前活动的工作区文件夹
  - 确保扫描范围限制在当前项目内
  - 实现工作区文件夹显示逻辑不受配置中隐藏文件/文件夹设置的影响
  - 严格根据物理文件夹是否为代码仓库来判断和显示
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 扫描结果只包含当前项目文件夹中的仓库
  - `human-judgment` TR-3.2: 多项目打开时只扫描当前活动项目
  - `programmatic` TR-3.3: 扫描逻辑不受隐藏文件设置影响
  - `programmatic` TR-3.4: 严格根据物理文件夹是否为代码仓库来判断
- **Notes**: 需要处理无活动工作区的情况

## [ ] Task 4: 优化单一表格界面
- **Priority**: P0
- **Depends On**: Task 3
- **Description**:
  - 优化现有单一表格界面，确保同时展示扫描结果和操作按钮
  - 确保界面布局清晰合理
  - 添加详细的操作日志输出
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-4.1: 所有信息在单一表格中展示
  - `human-judgment` TR-4.2: 界面布局清晰合理
  - `programmatic` TR-4.3: 操作过程中有详细的日志输出
- **Notes**: 保留必要的操作按钮和状态信息

## [ ] Task 5: 实现状态实时更新功能
- **Priority**: P0
- **Depends On**: Task 4
- **Description**:
  - 修改同步操作的回调逻辑，实时更新表格中的状态
  - 实现操作过程中的状态指示
  - 确保操作完成后显示最终结果
  - 确保执行操作不会替代原有的扫描结果列表
  - 确保执行操作不会对原有扫描结果列表产生任何干扰或替换
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgment` TR-5.1: 执行同步操作时状态实时更新
  - `human-judgment` TR-5.2: 操作完成后显示最终结果
  - `human-judgment` TR-5.3: 状态指示清晰明确
  - `human-judgment` TR-5.4: 执行操作后扫描结果列表保持不变
  - `human-judgment` TR-5.5: 执行操作不会对扫描结果列表产生干扰
- **Notes**: 需要处理同步失败的情况，显示错误信息

## [ ] Task 6: 测试所有功能
- **Priority**: P1
- **Depends On**: Task 5
- **Description**:
  - 测试插件启动是否不自动扫描
  - 测试手动扫描功能是否正常
  - 测试只扫描当前项目文件夹的功能
  - 测试单一表格展示是否正常
  - 测试状态实时更新功能
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5
- **Test Requirements**:
  - `human-judgment` TR-6.1: 所有功能正常工作
  - `human-judgment` TR-6.2: 界面响应速度快
  - `human-judgment` TR-6.3: 操作流程顺畅
- **Notes**: 测试时应使用不同大小的项目进行验证

## [ ] Task 7: 验证实现是否符合要求
- **Priority**: P1
- **Depends On**: Task 6
- **Description**:
  - 对照 PRD 文档验证所有功能是否实现
  - 检查代码是否符合质量要求
  - 确保用户体验良好
- **Acceptance Criteria Addressed**: 所有
- **Test Requirements**:
  - `human-judgment` TR-7.1: 所有功能符合 PRD 要求
  - `human-judgment` TR-7.2: 代码质量良好
  - `human-judgment` TR-7.3: 用户体验流畅
- **Notes**: 确保无遗漏的功能点
