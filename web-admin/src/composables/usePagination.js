import { ref, reactive } from 'vue'

export function usePagination(fetchFn, defaultPageSize = 100) {
  const list = ref([])
  const loading = ref(false)
  const total = ref(0)
  const pagination = reactive({
    page: 1,
    pageSize: defaultPageSize,
  })

  async function fetch(params = {}) {
    loading.value = true
    try {
      const res = await fetchFn({ page: pagination.page, pageSize: pagination.pageSize, ...params })
      list.value = res.data.list || res.data || []
      total.value = res.data.total || 0
    } finally {
      loading.value = false
    }
  }

  function onPageChange(page) {
    pagination.page = page
    fetch()
  }

  function onSizeChange(size) {
    pagination.pageSize = size
    pagination.page = 1
    fetch()
  }

  function resetAndFetch(params) {
    pagination.page = 1
    fetch(params)
  }

  return { list, loading, total, pagination, fetch, onPageChange, onSizeChange, resetAndFetch }
}
