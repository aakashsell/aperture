import unittest
import numpy as np
from stats import compute_experiment_stats, srm_test

class StatisticsTests(unittest.TestCase):
    def test_tiny_sample_has_no_inference(self):
        r=compute_experiment_stats([1],[0],'binary')
        self.assertIsNone(r['lift_ci_lower'])
        self.assertIsNone(r['p_value'])
    def test_zero_conversions_have_uncertainty(self):
        r=compute_experiment_stats(np.zeros(100),np.zeros(100),'binary')
        self.assertLess(r['lift_ci_lower'],0)
        self.assertGreater(r['lift_ci_upper'],0)
        self.assertEqual(r['p_value'],1)
    def test_unequal_allocation_is_not_srm(self):
        self.assertGreater(srm_test([900,100],[90,10]),.9)
    def test_missing_arm_is_srm(self):
        self.assertLess(srm_test([1000,0],[50,50]),.001)
    def test_continuous_does_not_invent_pvalues(self):
        r=compute_experiment_stats(np.arange(100)+10,np.arange(100))
        self.assertIsNone(r['p_value'])
        self.assertGreater(r['lift'],0)
        self.assertLess(r['lift_ci_lower'],r['lift_ci_upper'])
    def test_repeatable(self):
        self.assertEqual(compute_experiment_stats(np.arange(40),np.arange(40)+2),compute_experiment_stats(np.arange(40),np.arange(40)+2))
if __name__=='__main__':unittest.main()
