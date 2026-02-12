/**
 * 模块管理器
 * 用于管理和优化模块间的依赖关系
 */

class ModuleManager {
  constructor() {
    this.modules = new Map()
    this.dependencies = new Map()
  }

  /**
   * 注册模块
   * @param {string} moduleName - 模块名称
   * @param {object} moduleInstance - 模块实例
   * @param {array} [deps] - 依赖的模块名称
   */
  registerModule(moduleName, moduleInstance, deps = []) {
    this.modules.set(moduleName, moduleInstance)
    this.dependencies.set(moduleName, deps)
    console.log(`模块 ${moduleName} 已注册，依赖:`, deps)
  }

  /**
   * 获取模块
   * @param {string} moduleName - 模块名称
   * @returns {object|null} 模块实例
   */
  getModule(moduleName) {
    return this.modules.get(moduleName) || null
  }

  /**
   * 检查模块是否存在
   * @param {string} moduleName - 模块名称
   * @returns {boolean} 模块是否存在
   */
  hasModule(moduleName) {
    return this.modules.has(moduleName)
  }

  /**
   * 获取模块的依赖
   * @param {string} moduleName - 模块名称
   * @returns {array} 依赖的模块名称
   */
  getModuleDependencies(moduleName) {
    return this.dependencies.get(moduleName) || []
  }

  /**
   * 初始化所有模块
   */
  initAllModules() {
    console.log('开始初始化所有模块')
    
    // 按依赖顺序初始化模块
    const orderedModules = this.topologicalSort()
    
    orderedModules.forEach(moduleName => {
      const moduleInstance = this.modules.get(moduleName)
      if (moduleInstance && moduleInstance.init) {
        try {
          moduleInstance.init()
          console.log(`模块 ${moduleName} 初始化成功`)
        } catch (error) {
          console.error(`模块 ${moduleName} 初始化失败:`, error)
        }
      }
    })

    console.log('所有模块初始化完成')
  }

  /**
   * 拓扑排序，解决模块依赖顺序
   * @returns {array} 排序后的模块名称
   */
  topologicalSort() {
    const visited = new Set()
    const temp = new Set()
    const result = []

    const visit = (moduleName) => {
      if (temp.has(moduleName)) {
        throw new Error(`发现循环依赖: ${moduleName}`)
      }

      if (!visited.has(moduleName)) {
        temp.add(moduleName)
        
        const deps = this.dependencies.get(moduleName) || []
        for (const dep of deps) {
          visit(dep)
        }

        temp.delete(moduleName)
        visited.add(moduleName)
        result.push(moduleName)
      }
    }

    for (const moduleName of this.modules.keys()) {
      if (!visited.has(moduleName)) {
        visit(moduleName)
      }
    }

    return result
  }

  /**
   * 清理所有模块
   */
  cleanup() {
    console.log('开始清理所有模块')
    
    // 按依赖的反向顺序清理模块
    const orderedModules = this.topologicalSort().reverse()
    
    orderedModules.forEach(moduleName => {
      const moduleInstance = this.modules.get(moduleName)
      if (moduleInstance && moduleInstance.cleanup) {
        try {
          moduleInstance.cleanup()
          console.log(`模块 ${moduleName} 清理成功`)
        } catch (error) {
          console.error(`模块 ${moduleName} 清理失败:`, error)
        }
      }
    })

    this.modules.clear()
    this.dependencies.clear()
    console.log('所有模块清理完成')
  }

  /**
   * 获取模块信息
   * @returns {object} 模块信息
   */
  getModulesInfo() {
    const info = {
      modules: [],
      dependencies: {},
      totalModules: this.modules.size
    }

    for (const [moduleName, moduleInstance] of this.modules.entries()) {
      info.modules.push({
        name: moduleName,
        hasInit: !!moduleInstance.init,
        hasCleanup: !!moduleInstance.cleanup
      })
      info.dependencies[moduleName] = this.dependencies.get(moduleName) || []
    }

    return info
  }

  /**
   * 导出模块管理器状态
   * @returns {object} 状态信息
   */
  exportState() {
    return {
      modules: Object.fromEntries(this.modules),
      dependencies: Object.fromEntries(this.dependencies),
      info: this.getModulesInfo()
    }
  }
}

// 导出单例实例
const moduleManager = new ModuleManager()

module.exports = {
  ModuleManager,
  moduleManager
}