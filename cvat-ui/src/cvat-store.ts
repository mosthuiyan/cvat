// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) 2023 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import thunk from 'redux-thunk'; // 基于redux中间件实现action的异步dispatch
import {
    createStore, applyMiddleware, Store, Reducer,
} from 'redux'; // redux 接口, 包括创建store， 应用中间件, Store 和 Reducer 类型
import { createLogger } from 'redux-logger'; // 使用 redux-logger, 结合中间件在dispatch时记录日志
import { isDev } from 'utils/environment'; // 判断是否是开发环境, 如果是则启用中间件
import { CombinedState } from 'reducers'; // CVAT系统的全局 State

const logger = createLogger({ // https://www.npmjs.com/package/redux-logger
    predicate: isDev, // 如果是开发环境, 则logger会在每次action执行之前被调用
    collapsed: true, // 如果有多个相同类型的Action触发日志, 是否折叠日志
});

const middlewares = [thunk, logger];

let store: Store | null = null;

/**
 * 创建CVATStroe, 用于管理系统的全局状态, 全局State类型为CombinedState
 * @param createRootReducer 接收一个 Reducer
 */
export default function createCVATStore(createRootReducer: () => Reducer): void {
    let appliedMiddlewares = applyMiddleware(...middlewares);

    if (isDev()) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { composeWithDevTools } = require('redux-devtools-extension');

        appliedMiddlewares = composeWithDevTools(appliedMiddlewares);
    }

    store = createStore(createRootReducer(), appliedMiddlewares);
    store.subscribe(() => {
        const state = (store as Store).getState() as CombinedState;
        for (const plugin of Object.values(state.plugins.current)) {
            const { globalStateDidUpdate } = plugin;
            if (globalStateDidUpdate) {
                globalStateDidUpdate(state);
            }
        }
    });
}
/**
 * 获取全局的 Store<CombinedState>
 * @returns 获取CVATStore
 */
export function getCVATStore(): Store<CombinedState> {
    if (store) {
        return store;
    }

    throw new Error('First create a store');
}
