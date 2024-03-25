// Copyright (C) 2020-2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSelector } from 'react-redux';

import GlobalHotKeys from 'utils/mousetrap-react';
import { CombinedState } from 'reducers';
import './styles.scss';

/**
 * 在id为layout-grid的HTML元素上加载快捷键, 在state.shortcuts中定义
 * cvat-ui/src/reducers/shortcuts-reducer.ts中可以查询到快捷键的定义
 * 此处主要是定义了
 * @returns LayoutGrid空组件，渲染到id为layout-grid的父组件中启
 */
const LayoutGrid = (): React.ReactPortal => {
    const [showGrid, setShowGrid] = useState(false);
    const keyMap = useSelector((state: CombinedState) => state.shortcuts.keyMap);
    const subKeyMap = {
        TOGGLE_LAYOUT_GRID: keyMap.TOGGLE_LAYOUT_GRID,
    };
    // 这个网格用于开发环境debug, 方便查看网页的全局网格布局。
    //    TOGGLE_LAYOUT_GRID: {
    //     name: 'Toggle layout grid',
    //     description: 'The grid is used to UI development',
    //     sequences: ['ctrl+alt+enter'],
    //     action: 'keydown',
    // }
    const toggleLayoutGrid = useCallback((): void => {
        setShowGrid((prevState: boolean) => !prevState);
    }, [showGrid]);

    const handlers = {
        TOGGLE_LAYOUT_GRID: toggleLayoutGrid,
    };

    const portalContent: JSX.Element = (
        <GlobalHotKeys keyMap={subKeyMap} handlers={handlers}>
            <>
                {showGrid && <div className='grid sm' />}
                {showGrid && <div className='grid lg' />}
            </>
        </GlobalHotKeys>
    );

    return ReactDOM.createPortal(portalContent, document.getElementById('layout-grid') as HTMLElement);
};

export default LayoutGrid;
