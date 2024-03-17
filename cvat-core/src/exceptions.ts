// Copyright (C) 2019-2022 Intel Corporation
// Copyright (C) 2022 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import Platform from 'platform';
import ErrorStackParser from 'error-stack-parser';

/**
 *  定义了cvat中的异常基类，添加了一些额外信息。
 */
export class Exception extends Error {
    private readonly time: string; // 异常触发的时间
    private readonly system: string; // 操作系统名称
    private readonly client: string; // 浏览器名称 + 版本
    private readonly info: string; // 错误调用栈
    private readonly filename: string; // 文件名
    private readonly line: number; // 行号
    private readonly column: number; // 列号

    constructor(message) {
        super(message);
        const time = new Date().toISOString();
        const system = Platform.os.toString();
        const client = `${Platform.name} ${Platform.version}`;
        const info = ErrorStackParser.parse(this)[0];
        const filename = `${info.fileName}`;
        const line = info.lineNumber;
        const column = info.columnNumber;

        Object.defineProperties(
            this,
            Object.freeze({
                system: {
                    /**
                     * @name system
                     * @type {string}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => system,
                },
                client: {
                    /**
                     * @name client
                     * @type {string}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => client,
                },
                time: {
                    /**
                     * @name time
                     * @type {string}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => time,
                },
                filename: {
                    /**
                     * @name filename
                     * @type {string}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => filename,
                },
                line: {
                    /**
                     * @name line
                     * @type {number}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => line,
                },
                column: {
                    /**
                     * @name column
                     * @type {number}
                     * @memberof module:API.cvat.exceptions.Exception
                     * @readonly
                     * @instance
                     */
                    get: () => column,
                },
            }),
        );
    }
}

/**
 * 参数错误
 */
export class ArgumentError extends Exception {
}

/**
 * 数据错误
 */
export class DataError extends Exception {
}

/**
 * 脚本错误
 */
export class ScriptingError extends Exception {
}

/**
 * 服务器错误
 */
export class ServerError extends Exception {
    public code: number; // 错误码

    constructor(message, code) {
        super(message);

        Object.defineProperties(
            this,
            Object.freeze({
                code: {
                    get: () => code,
                },
            }),
        );
    }
}
