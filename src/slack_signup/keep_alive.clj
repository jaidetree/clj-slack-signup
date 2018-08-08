(ns slack-signup.keep-alive
  (:require [clojure.core.async :refer [go-loop <! <!! timeout]]
            [clj-http.client :as http]))

(defn -main
  "Keep the slack app alive to prevent sleeping... think of this as
  manual caffiene."
  []
  (<!! (go-loop []
        (do
          (println "Pinging slack signup app")
          (http/get "https://slack.venuebook.com")
          ;; Every 15 min
          (<! (timeout 900000))
          (recur)))))
