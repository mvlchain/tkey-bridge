//
//  JavascriptFunction.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 25/10/2021.
//

typealias JavascriptCallback = (Bool, Any?) -> Void

struct JavascriptFunction {
    var functionString:String
    var callback: JavascriptCallback
}
