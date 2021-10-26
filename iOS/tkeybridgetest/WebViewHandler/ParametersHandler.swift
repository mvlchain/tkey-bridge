//
//  ParametersHandler.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 25/10/2021.
//

import Foundation

class ParametersHandler {

    class func decodeParameters(inString parametersString: String) -> [String: Any]? {
        if let convertedString = parametersString.removingPercentEncoding,
           let queryItems = URLComponents(string:convertedString)?.queryItems {
            var parameters:[String:Any] = [:]
            for item in queryItems {
                parameters[item.name] = item.value ?? ""
            }
            return parameters
        }
        return nil
    }
}
