import { useEffect, useMemo, useState } from 'react'
import { useSessionStorageState } from '@umijs/hooks'
import { IColumn } from 'office-ui-fabric-react/lib/DetailsList'

import client, {
  ErrorStrategy,
  StatementModel,
  StatementTimeRange,
} from '@lib/client'
import { IColumnKeys } from '@lib/components'
import useOrderState, { IOrderOptions } from '@lib/utils/useOrderState'

import {
  calcValidStatementTimeRange,
  DEFAULT_TIME_RANGE,
  TimeRange,
} from '../pages/List/TimeRangeSelector'
import { derivedFields, statementColumns } from './tableColumns'
import { getSelectedFields } from '@lib/utils/tableColumnFactory'

export const DEF_STMT_COLUMN_KEYS: IColumnKeys = {
  digest_text: true,
  sum_latency: true,
  avg_latency: true,
  exec_count: true,
  plan_count: true,
  related_schemas: true,
}

const QUERY_OPTIONS = 'statement.query_options'

const DEF_ORDER_OPTIONS: IOrderOptions = {
  orderBy: 'sum_latency',
  desc: true,
}

export interface IStatementQueryOptions {
  timeRange: TimeRange
  schemas: string[]
  stmtTypes: string[]
  searchText: string
}

export const DEF_STMT_QUERY_OPTIONS: IStatementQueryOptions = {
  timeRange: DEFAULT_TIME_RANGE,
  schemas: [],
  stmtTypes: [],
  searchText: '',
}

export interface IStatementTableController {
  queryOptions: IStatementQueryOptions
  setQueryOptions: (options: IStatementQueryOptions) => void
  orderOptions: IOrderOptions
  changeOrder: (orderBy: string, desc: boolean) => void
  refresh: () => void

  enable: boolean
  allTimeRanges: StatementTimeRange[]
  allSchemas: string[]
  allStmtTypes: string[]
  validTimeRange: StatementTimeRange
  loadingStatements: boolean
  statements: StatementModel[]

  errors: Error[]

  tableColumns: IColumn[]
  visibleColumnKeys: IColumnKeys

  downloadCSV: () => Promise<void>
  downloading: boolean
}

export default function useStatementTableController(
  visibleColumnKeys: IColumnKeys,
  showFullSQL: boolean,
  options?: IStatementQueryOptions,
  needSave: boolean = true
): IStatementTableController {
  const { orderOptions, changeOrder } = useOrderState(
    'statement',
    needSave,
    DEF_ORDER_OPTIONS
  )

  const [memoryQueryOptions, setMemoryQueryOptions] = useState(
    options || DEF_STMT_QUERY_OPTIONS
  )
  const [sessionQueryOptions, setSessionQueryOptions] = useSessionStorageState(
    QUERY_OPTIONS,
    options || DEF_STMT_QUERY_OPTIONS
  )
  const queryOptions = useMemo(
    () => (needSave ? sessionQueryOptions : memoryQueryOptions),
    [needSave, memoryQueryOptions, sessionQueryOptions]
  )

  const [enable, setEnable] = useState(true)
  const [allTimeRanges, setAllTimeRanges] = useState<StatementTimeRange[]>([])
  const [allSchemas, setAllSchemas] = useState<string[]>([])
  const [allStmtTypes, setAllStmtTypes] = useState<string[]>([])

  const validTimeRange = useMemo(
    () => calcValidStatementTimeRange(queryOptions.timeRange, allTimeRanges),
    [queryOptions, allTimeRanges]
  )

  const [loadingStatements, setLoadingStatements] = useState(true)
  const [statements, setStatements] = useState<StatementModel[]>([])

  const [refreshTimes, setRefreshTimes] = useState(0)

  function setQueryOptions(newOptions: IStatementQueryOptions) {
    if (needSave) {
      setSessionQueryOptions(newOptions)
    } else {
      setMemoryQueryOptions(newOptions)
    }
  }

  const [errors, setErrors] = useState<any[]>([])

  function refresh() {
    setErrors([])
    setRefreshTimes((prev) => prev + 1)
  }

  useEffect(() => {
    async function queryStatementStatus() {
      try {
        const res = await client.getInstance().statementsConfigGet({
          errorStrategy: ErrorStrategy.Custom,
        })
        setEnable(res?.data.enable!)
      } catch (e) {
        setErrors((prev) => prev.concat(e))
      }
    }

    async function querySchemas() {
      try {
        const res = await client.getInstance().infoListDatabases({
          errorStrategy: ErrorStrategy.Custom,
        })
        setAllSchemas(res?.data || [])
      } catch (e) {
        setErrors((prev) => prev.concat(e))
      }
    }

    async function queryTimeRanges() {
      try {
        const res = await client.getInstance().statementsTimeRangesGet({
          errorStrategy: ErrorStrategy.Custom,
        })
        setAllTimeRanges(res?.data || [])
      } catch (e) {
        setErrors((prev) => prev.concat(e))
      }
    }

    async function queryStmtTypes() {
      try {
        const res = await client.getInstance().statementsStmtTypesGet({
          errorStrategy: ErrorStrategy.Custom,
        })
        setAllStmtTypes(res?.data || [])
      } catch (e) {
        setErrors((prev) => prev.concat(e))
      }
    }

    queryStatementStatus()
    querySchemas()
    queryTimeRanges()
    queryStmtTypes()
  }, [refreshTimes])

  const selectedFields = useMemo(
    () => getSelectedFields(visibleColumnKeys, derivedFields).join(','),
    [visibleColumnKeys]
  )

  const tableColumns = useMemo(
    () => statementColumns(statements, showFullSQL),
    [statements, showFullSQL]
  )

  useEffect(() => {
    async function queryStatementList() {
      if (allTimeRanges.length === 0) {
        setStatements([])
        setLoadingStatements(false)
        return
      }

      setLoadingStatements(true)
      try {
        const res = await client
          .getInstance()
          .statementsListGet(
            validTimeRange.begin_time!,
            validTimeRange.end_time!,
            selectedFields,
            queryOptions.schemas,
            queryOptions.stmtTypes,
            queryOptions.searchText,
            {
              errorStrategy: ErrorStrategy.Custom,
            }
          )
        setStatements(res?.data || [])
        setErrors([])
      } catch (e) {
        setErrors((prev) => prev.concat(e))
      }
      setLoadingStatements(false)
    }

    queryStatementList()
  }, [queryOptions, allTimeRanges, validTimeRange, selectedFields])

  const [downloading, setDownloading] = useState(false)

  async function downloadCSV() {
    try {
      setDownloading(true)
      const res = await client.getInstance().statementsDownloadTokenPost({
        begin_time: validTimeRange.begin_time,
        end_time: validTimeRange.end_time,
        fields: '*',
        schemas: queryOptions.schemas,
        stmt_types: queryOptions.stmtTypes,
        text: queryOptions.searchText,
      })
      const token = res.data
      if (token) {
        window.location.href = `${client.getBasePath()}/statements/download?token=${token}`
      }
    } finally {
      setDownloading(false)
    }
  }

  return {
    queryOptions,
    setQueryOptions,
    orderOptions,
    changeOrder,
    refresh,

    enable,
    allTimeRanges,
    allSchemas,
    allStmtTypes,
    validTimeRange,
    loadingStatements,
    statements,

    errors,

    tableColumns,
    visibleColumnKeys,

    downloadCSV,
    downloading,
  }
}
