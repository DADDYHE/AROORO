const PAGE_DATA = {
  nav: {
    links: [
      { label: '首页', target: 'cover' },
      { label: '摘要', target: 'summary' },
      { label: '痛点', target: 'pain' },
      { label: '破局', target: 'breakthrough' },
      { label: '信任', target: 'trust' },
      { label: '利益', target: 'benefit' },
      { label: '产品', target: 'product' },
      { label: '模式', target: 'model' },
      { label: '盈利', target: 'profit' },
      { label: '竞品', target: 'compete' },
      { label: '技术', target: 'tech' },
      { label: '里程碑', target: 'milestone' },
      { label: '融资', target: 'funding' },
      { label: '风险', target: 'risk' },
      { label: '时机', target: 'timing' },
      { label: '团队', target: 'team' },
      { label: '联系', target: 'contact' }
    ]
  },

  cover: {
    label: 'Business Plan · 2026.07',
    title: 'AROORO',
    desc: '宠物私域群主的数字资产平台',
    tagline: '安心呼噜 · 放心托付',
    scrollHint: 'Scroll to explore'
  },

  summary: {
    label: '01 · Executive Summary',
    title: '帮群主把社交关系<br>变成可增值的数字资产',
    desc: '活动工具（建立粘性） + 宠团团（资产确权、持续引流） + 商城（信任变现），深度生态锁定。<br>产品已就绪，2,749 个测试用例验证，启动零技术风险。',
    metrics: [
      { value: '已就绪', label: 'Product', desc: '2,749 测试用例 · 70% 覆盖率 · 15+ 后台模块' },
      { value: '30+', label: '预备群主', desc: '创始团队自带 · 5 年信任关系 · 启动即可激活' },
      { value: '150万', label: 'Pre-Seed', desc: '出让 18-20% · 里程碑对赌机制' }
    ],
    insight: {
      label: '核心资产',
      text: '创始团队 5 年建立 30+ 宠物私域群主信任网络，覆盖 5000+ 精准宠主。启动即可激活。'
    }
  },

  pain: {
    label: '02 · The Death Spiral',
    title: '群主的死亡螺旋',
    subtitle: '数字资产正在被剥削',
    spiral: [
      { num: '01', title: '商业活动减少', desc: '品牌方投放收缩，群主能承接的商业活动越来越少。自办活动需自担成本，投入产出难以平衡。' },
      { num: '02', title: '粉丝不见面', desc: '缺少线下触点，群成员只是头像。信任无法沉淀，关系停留在"加过好友"。' },
      { num: '03', title: '群慢慢死掉', desc: '没有内容、没有活动、没有交易，活跃度持续下滑，群逐渐变成僵尸。' },
      { num: '04', title: '转化率萎缩', desc: '带货转化率同步缩水，收入越少越没动力运营，进入恶性循环。' },
      { num: '05', title: '用户被薅走', desc: '传统团购工具卖完一单，用户数据留在平台。下次平台直接触达，群主被彻底绕开。' },
      { num: '06', title: '收入归零', desc: '最后一波佣金结算完，群主手上只剩一个空群和一地鸡毛。' }
    ],
    insight: {
      label: '核心困境',
      text: '在群主现在使用的分销工具中，群主只是被当作"流量入口"。用户关系被上层截留，微薄的佣金无法覆盖运营成本。数字资产价值被持续稀释，直到归零。<br><br><strong>群主需要的不是分销工具，而是可以帮他把社交关系变成数字资产的平台。</strong>'
    }
  },

  breakthrough: {
    label: '03 · Breakthrough',
    title: '破局点',
    subtitle: '给群主输送弹药',
    cards: [
      { role: 'Supply Side', title: '新品牌', desc: '后期品牌方将原本投流的费用（150-300 元/人），转化为直接给宠主的试吃装，效率提升数十倍。前期由平台补贴活动成本。' },
      { role: 'Scene', title: '私域群主', desc: '前期平台补贴活动成本，群主零成本办活动，维护私域粉丝信任关系。平台活动工具让流程变得极致便捷。' },
      { role: 'Platform', title: 'AROORO', desc: '前期平台补贴活动成本，同时嵌入团购分销板块。积累用户后引入品牌方。' }
    ],
    insight: {
      text: '<strong>结果：</strong>群主零成本办活动。这是"救命恩人"级别的依赖。'
    },
    flywheel: [
      '平台赞助活动 → 粉丝信任回升',
      '群主活跃分享 → 平台 GMV 增长',
      '平台 GMV 增长 → 吸引新品牌',
      '品牌入场赞助 → 增长飞轮加速'
    ]
  },

  trust: {
    label: '04 · Trust Transfer',
    title: '粉丝信任的三层平移',
    subtitle: '私域群主就是最好的信任背书',
    cards: [
      { num: '01', title: '宠主 → 群主', desc: '通过线下聚会建立的真实信任关系。', source: '来源：面对面互动' },
      { num: '02', title: '群主 → 平台', desc: '帮群主办活动把社交关系确权为数字资产、建立管道收益。利益深度捆绑。', source: '来源：利益捆绑共同体' },
      { num: '03', title: '宠主 → 平台', desc: '因为群主推荐所以更有购买意愿。信任从人传导到平台。', source: '来源：信任传导' }
    ],
    table: {
      title: '品牌触达"精准客户"成本',
      headers: ['渠道', '单客成本', '谁买单', '成本对比', '信息来源'],
      rows: [
        ['天猫 / 京东', '50-150 元/人', '平台自付', '高', '《2026 年中国宠物行业白皮书》'],
        ['抖音投流', '80-100 元/人', '品牌自付', '高', '尚普咨询集团调研数据、华信人咨询行业观察'],
        ['AROORO', '试吃/试用装', '前期平台采购<br>后期品牌自付', '低', '—']
      ]
    }
  },

  benefit: {
    label: '05 · Benefit Reconstruction',
    title: '利益重构 · 资产觉醒',
    subtitle: '私域群主从搬运工到资产所有者',
    vs: {
      leftName: '群主收益（快团团）',
      leftAmount: '0.5–1.5',
      leftUnit: '元/包（50 元尿垫）',
      leftDetail: '平台-供应链-供货团长-私域群主，3 层分销，群主处于末端，分成 1%–3%。无确权，一次性佣金。',
      rightName: '群主收益（AROORO）',
      rightAmount: '7.5–15',
      rightUnit: '元/包（50 元尿垫）',
      rightDetail: '平台—私域群主 1 层分销，团购分成 15%–30%、商城 10%–20%。永久绑定 = 资产确权；永久分润 + 数据沉淀 = 资产增值。'
    },
    table: {
      title: '平台收益',
      headers: ['指标', '金额', '说明'],
      rows: [
        ['客单价', '200 元', '主粮均价'],
        ['毛利（约20%）', '40 元', '以大品牌佣金计算'],
        ['合作伙伴分佣', '-20 元', '50% 分润给群主'],
        ['平台留存', '20 元', '平台毛利'],
        ['扣除费用', '-7~8 元', '支付 + 客服 + 退换货损耗'],
        ['净利 / 单', '12 元', '净利率约6%，宠物电商平均净利润率仅3%-5%，6%已超过行业平均']
      ]
    }
  },

  product: {
    label: '06 · Product System',
    title: '产品体系',
    subtitle: '活动工具 + 宠团团 + 商城 + 群主动态淘汰',
    cards: [
      { role: '01', title: '活动工具', desc: '活动发布、签到报表、活动海报、抽奖、问卷。降低群主运营精力，同时自然嵌入团购入口。' },
      { role: '02', title: '宠团团', desc: '团购分销引擎。用户通过群主邀请注册，永久绑定，为群主持续产生管道收益。' },
      { role: '03', title: '宠物商城', desc: '已上线，待品牌入驻。大品牌、高质量体验，与团购板块并行。' },
      { role: '04', title: '动态淘汰', desc: '活跃度决定分润比例：高 10% → 中 5% → 低 冻结 → 解绑。保证资产健康。' }
    ]
  },

  model: {
    label: '07 · Business Model',
    title: '商业模式 · 三方共赢',
    subtitle: '平台撮合品牌与群主，双方获益',
    cards: [
      { role: 'Brand / Factory', title: '品牌 / 工厂', desc: '把投流预算变成试吃装，直达精准宠主。获得真实用户体验与口碑。' },
      { role: 'Group Owner', title: '群主', desc: '低成本办活动，分销收益提升数倍，粉丝成为可增值数字资产。' },
      { role: 'Pet Owner', title: '宠主', desc: '参与活动得伴手礼 + 基于信任的推荐 + 后续寄养、上门等优质服务。' }
    ],
    chain: {
      title: '发展链条',
      items: [
        { period: '0–6 个月', title: '助力群主开展活动', desc: '自采/品牌提供试吃装破冰，迅速建立 SOP' },
        { period: '6–12 个月', title: '中小品牌入驻', desc: '拿到数据后谈中小品牌入驻商城' },
        { period: '12 个月+', title: '国际大牌商城', desc: '用户基数足够后计划引入高端品牌' }
      ]
    },
    insight: {
      label: '双板块结构',
      text: '团购提供高频次商品，不涉及食品、保健品，降低风险同时持续引流。商城负责体验升级。团购不关闭，为商城持续输血。'
    }
  },

  profit: {
    label: '08 · Profitability',
    title: '盈利模型',
    subtitle: '商城 UE 与盈亏平衡测算',
    table: {
      headers: ['收入来源', '说明', '0–6月', '6–12月'],
      rows: [
        ['团购 GMV 抽佣', '~5–10% 技术服务费', '●', '●'],
        ['商城 GMV 抽佣', '品牌方佣金', '○', '●'],
        ['品牌入驻费', '商城品牌入驻', '○', '●'],
        ['宠物服务抽佣', '寄养 / 上门服务', '○', '○']
      ]
    },
    breakeven: [
      { label: '月固定成本', value: '~7.5 万' },
      { label: '每单净利', value: '~12 元' },
      { label: '月盈亏平衡单量', value: '6,250' }
    ],
    insight: {
      text: '按 30+ 月活群主、每群 200 人、年复购 12–15 次测算，第 9–12 个月可接近盈亏平衡。'
    },
    defense: [
      { label: 'Moat 01', title: '信任关系', desc: 'COO 2 年建立 30+ 预备役群主网络' },
      { label: 'Moat 02', title: '网络效应', desc: '群主越多 → 品牌越多 → 用户越多' },
      { label: 'Moat 03', title: '切换成本', desc: '资产确权 + 永久分润 + 数据沉淀' }
    ]
  },

  compete: {
    label: '09 · Competitive Analysis',
    title: '竞品分析',
    subtitle: 'AROORO 不是渠道，而是群主资产操作系统',
    table: {
      headers: ['维度', '快团团', '京东 / 天猫', '抖音', 'AROORO'],
      rows: [
        ['群主收益', '末端，0.5-1.5 元', '无', '无', '15-30%，7.5-15 元'],
        ['用户归属', '平台所有', '平台所有', '平台所有', '群主确权'],
        ['获客成本', '自付 / 无场景', '150-300 元', '80-150 元', '前期平台补贴'],
        ['信任基础', '低价', '平台品牌', '内容投流', '私域群主信任'],
        ['服务延伸', '无', '无', '无', '寄养 / 上门服务'],
        ['本质差异', '流量贩卖平台', '流量贩卖平台', '流量贩卖平台', '数字资产操作系统']
      ]
    },
    conclusion: '竞争壁垒 = 信任关系 + 网络效应 + 切换成本 + 线下脏活'
  },

  tech: {
    label: '10 · Tech Capability',
    title: '技术能力',
    subtitle: '产品已就绪，支撑快速扩张',
    stats: [
      { value: '70%', label: '测试覆盖率' },
      { value: '2,749', label: '测试用例' },
      { value: '15+', label: '后台模块' },
      { value: '0', label: '重大 Bug' }
    ],
    table: {
      title: '技术选型',
      headers: ['层级', '技术选型'],
      rows: [
        ['前端', '微信小程序原生 + TypeScript（已上线）'],
        ['后端', 'CloudBase + Node.js 云函数'],
        ['数据库', '云端弹性数据库（幂等防重 + 事务补偿）'],
        ['部署', 'Serverless，按需扩缩容']
      ]
    },
    timeline: {
      title: '产品路线图',
      items: [
        { period: '2026.Q3', title: '活动工具上线', desc: '办活动 + 团购分销' },
        { period: '2026.Q4', title: '宠团团规模化', desc: '30+ 月活群主' },
        { period: '2027.Q1', title: '品牌商城', desc: '中小品牌入驻' },
        { period: '2027.Q2+', title: '寄养 / 上门服务', desc: '服务生态延伸' }
      ]
    }
  },

  milestone: {
    label: '11 · Milestones',
    title: '运营里程碑',
    subtitle: '18 个月从冷启动到规模化',
    timeline: [
      { period: 'M1', title: '启动上线', desc: '上线 5 个城市，从 30+ 预备役转化 20+ 月活群主，打造 10 个标杆群。' },
      { period: 'M3', title: '群主裂变', desc: '月活群主 > 30 人，GMV 突破 15 万，跑通 SOP。' },
      { period: 'M6', title: '规模复制', desc: '月活群主 50+，GMV 80 万，拓展至 15 城。' },
      { period: 'M12', title: '品牌入驻', desc: '引入 3-5 个品牌商城，月 GMV 200 万+。' },
      { period: 'M18', title: '生态成熟', desc: '月活群主 100+，年 GMV 3000 万，启动 A 轮。' }
    ],
    insight: {
      label: '收入预测',
      bigNumber: '3000万',
      bigNumberLabel: '第 18 个月年 GMV 目标',
      text: '按 M18 目标 50+ 月活群主，每群 200 精准宠主，年复购 12-15 次，客单价 200 元测算。'
    }
  },

  funding: {
    label: '12 · Funding',
    title: 'Pre-Seed 融资',
    bigNumber: '¥150万',
    bigNumberLabel: '出让 18-20% 股权 · 里程碑对赌',
    alloc: [
      { name: '供应链破冰', pct: '35%' },
      { name: '运营补贴', pct: '30%' },
      { name: '团队招聘', pct: '20%' },
      { name: '技术打磨', pct: '15%' }
    ],
    insight: {
      text: '<strong>18 个月 Runway</strong>，足够完成从 0 到 1 并验证商业模式。'
    }
  },

  risk: {
    label: '13 · Risk & Response',
    title: '风险与应对',
    subtitle: '三道防线 + Plan B',
    table: {
      headers: ['风险', '应对策略'],
      rows: [
        ['群主流失', '资产确权 + 动态淘汰，让活跃群主收益更高，僵尸群主自然退出。'],
        ['大品牌截胡', '先做线下脏活累活（活动、寄养），建立信任壁垒和独家协议。'],
        ['数据合规', '云端弹性数据库 + 幂等防重 + 事务补偿机制，技术尽调安全。'],
        ['供应链不稳定', '多品牌备选，先从白牌/工厂切入，降低单一依赖。']
      ]
    },
    defense: [
      { label: '第一道防线', title: '信任关系', desc: '30+ 预备役群主 + 3000+ 精准宠主。' },
      { label: '第二道防线', title: '网络效应', desc: '群主越多，品牌越多，用户越多。' },
      { label: '第三道防线', title: '切换成本', desc: '资产确权 + 永久分润 + 数据沉淀。' }
    ],
    planB: '若补贴战不利，30+ 预备役群主信任网络可直接转型高毛利宠物服务（寄养 / 上门），避开价格战。'
  },

  timing: {
    label: '14 · Why Now',
    title: '为什么是现在',
    subtitle: '窗口期正在关闭',
    cards: [
      { role: '01', title: '私域红利尾声', desc: '群主流失严重，谁先帮群主变现，谁就锁定下一代渠道。' },
      { role: '02', title: '宠物消费升级', desc: '从"吃饱"到"养好"，高端主粮、服务需求爆发。' },
      { role: '03', title: '信任稀缺时代', desc: '公域流量成本飙升，私域信任成为最高效的获客杠杆。' }
    ],
    conclusion: '<strong>结论：</strong>未来 12 个月是建立私域群主资产操作系统的最佳窗口。错过这个窗口，市场将被平台或大品牌割据。'
  },

  team: {
    label: '15 · Core Team',
    title: '核心团队',
    subtitle: '产品 + 信任网络的组合',
    members: [
      { avatar: '何', name: '何哲宇', role: 'Founder & CEO', desc: '连续创业者，10 年互联网经验。独立完成全部技术开发（小程序 + 后端 + 后台），证明极强执行力。负责战略、产品与技术架构。' },
      { avatar: '冯', name: '冯钟瑶', role: 'Co-Founder & COO', desc: '资深养宠人，两年寄养经验。活跃于多个犬种社群，自带 30+ 预备役群主资源（2 年信任关系）。深知宠主需求与群主运营。' }
    ],
    insight: {
      text: '<strong>招技术负责人 ≠ 架构撑不住</strong> — CloudBase + Serverless 足以支撑千万级流水。招人是"买 CEO 的时间"——从写代码转向搞定供应链和群主 SOP。'
    }
  },

  contact: {
    label: '16 · Contact',
    title: '与我们同行',
    desc: '如果相信私域信任值得被重新定价，欢迎加入 AROORO 的种子旅程。',
    items: [
      { label: 'Email', value: 'AROORO@163.com' },
      { label: 'Company', value: '成都零克乐克宠物服务有限公司' },
      { label: 'Location', value: '中国 · 成都' }
    ]
  }
};
