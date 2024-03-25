// Copyright (C) 2023 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import { Dispatch, AnyAction } from 'redux';
import { useDispatch } from 'react-redux';

import { PluginsActionTypes, pluginActions } from 'actions/plugins-actions';
import { getCore, CVATCore, APIWrapperEnterOptions } from 'cvat-core-wrapper';
import { modelsActions } from 'actions/models-actions';
// CVAT core 模块
const core = getCore();
/**
 * 插件的Action创建函数的类型
 */
export type PluginActionCreators = {
    getModelsSuccess: typeof modelsActions['getModelsSuccess'],
};
/**
 * 构建插件组件, 定义了构建函数的类型，所有的插件类型为ComponentBuilder函数返回的类型
 */
export type ComponentBuilder = ({
    dispatch,
    REGISTER_ACTION,
    REMOVE_ACTION,
    actionCreators,
    core,
}: {
    dispatch: Dispatch<AnyAction>,
    REGISTER_ACTION: PluginsActionTypes.ADD_UI_COMPONENT,
    REMOVE_ACTION: PluginsActionTypes.REMOVE_UI_COMPONENT,
    actionCreators: PluginActionCreators,
    core: CVATCore,
}) => {
    name: string;
    destructor: CallableFunction;
    globalStateDidUpdate?: CallableFunction;
};

export type PluginEntryPoint = (componentBuilder: ComponentBuilder) => void;
export type {
    APIWrapperEnterOptions,
};
/**
 * 插件的入口
 * @returns null
 */
function PluginEntrypoint(): null {
    const dispatch = useDispatch();

    useEffect(() => {
        // 在全局的 window 对象注册插件, 不需要显示, 仅注册插件， 相当于注册了一个函数可以供全局调用
        Object.defineProperty(window, 'cvatUI', {
            value: Object.freeze({
                registerComponent: (componentBuilder: ComponentBuilder) => {
                    const { name, destructor, globalStateDidUpdate } = componentBuilder({
                        dispatch,
                        REGISTER_ACTION: PluginsActionTypes.ADD_UI_COMPONENT,
                        REMOVE_ACTION: PluginsActionTypes.REMOVE_UI_COMPONENT,
                        actionCreators: {
                            getModelsSuccess: modelsActions.getModelsSuccess,
                        },
                        core,
                    });

                    dispatch(pluginActions.addPlugin(name, destructor, globalStateDidUpdate));
                },
            }),
        });

        setTimeout(() => {
            window.document.dispatchEvent(new CustomEvent('plugins.ready', { bubbles: true }));
        });
    }, []);

    return null;
}

export default React.memo(PluginEntrypoint);
